-- Audit cleanup — suppression code mort et optimisation indexes.
--
-- 1. Indexes redondants : 4 index "score IS NOT NULL" préexistaient avant le modèle
--    enrichment_level strict. Maintenant que raw n'a jamais de score, les index
--    enrichment_level IN ('standard','deep') les couvrent entièrement.
--    Ces 4 index ralentissaient les upserts sans jamais servir la recherche.
--
-- 2. search_persons_by_criteria : retire la condition 'patrimony_score IS NOT NULL'
--    redondante (enrichment_level suffit comme gate). Évite de masquer des profils
--    standard dont le score serait null par bug.
--
-- 3. backfill_signals_for_prospect v1 (SIREN unique) : remplacé partout par v2
--    (tableau de SIRENs). scripts/backfill-signals.ts migré vers v2.

-- Indexes redondants
DROP INDEX IF EXISTS idx_persons_dept_score;
DROP INDEX IF EXISTS idx_persons_naf_score;
DROP INDEX IF EXISTS idx_persons_type_dept_score2;
DROP INDEX IF EXISTS idx_persons_type_score;

-- RPC search : gate enrichment_level uniquement
CREATE OR REPLACE FUNCTION public.search_persons_by_criteria(
  p_naf_codes    text[]  DEFAULT NULL,
  p_person_types text[]  DEFAULT NULL,
  p_departements text[]  DEFAULT NULL,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE(
  canonical_key   text,
  prenom          text,
  nom             text,
  siren           text,
  departement     text,
  naf_code        text,
  person_type     text,
  raw_data        jsonb,
  extended_data   jsonb,
  patrimony_score integer,
  raison_principale text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _wheres text[] := ARRAY['enrichment_level IN (''standard'', ''deep'')'];
  _sql    text;
BEGIN
  SET LOCAL statement_timeout = '30s';

  IF p_naf_codes IS NOT NULL THEN
    IF array_length(p_naf_codes, 1) = 1 THEN
      _wheres := _wheres || format('naf_code = %L', p_naf_codes[1]);
    ELSE
      _wheres := _wheres || format('naf_code = ANY(%L::text[])', p_naf_codes);
    END IF;
  END IF;

  IF p_person_types IS NOT NULL THEN
    IF array_length(p_person_types, 1) = 1 THEN
      _wheres := _wheres || format('person_type = %L', p_person_types[1]);
    ELSE
      _wheres := _wheres || format('person_type = ANY(%L::text[])', p_person_types);
    END IF;
  END IF;

  IF p_departements IS NOT NULL THEN
    IF array_length(p_departements, 1) = 1 THEN
      _wheres := _wheres || format('departement = %L', p_departements[1]);
    ELSE
      _wheres := _wheres || format('departement = ANY(%L::text[])', p_departements);
    END IF;
  END IF;

  _sql := format(
    'SELECT canonical_key, prenom, nom, siren, departement, naf_code, person_type,
            raw_data, extended_data, patrimony_score, raison_principale
     FROM   prospection_persons
     WHERE  %s
     ORDER  BY patrimony_score DESC NULLS LAST, random()
     LIMIT  %s',
    array_to_string(_wheres, ' AND '),
    p_limit::text
  );

  RETURN QUERY EXECUTE _sql;
END;
$$;

-- backfill v1 remplacé par v2 (multi-SIREN)
DROP FUNCTION IF EXISTS backfill_signals_for_prospect(uuid, uuid, text, timestamp with time zone);
