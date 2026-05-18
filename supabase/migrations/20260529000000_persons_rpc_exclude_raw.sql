-- search_persons_by_criteria : exclure les profils 'raw' du pool de recherche.
-- Règle métier : le CGP ne peut tomber que sur des personnes 'standard' ou 'deep',
-- jamais sur des données brutes non enrichies.
-- Le quick-score peut avoir renseigné patrimony_score sur un profil raw — on filtre
-- donc sur enrichment_level et non sur patrimony_score seul.

CREATE OR REPLACE FUNCTION search_persons_by_criteria(
  p_naf_codes text[] DEFAULT NULL,
  p_person_types text[] DEFAULT NULL,
  p_departements text[] DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  canonical_key text, prenom text, nom text, siren text,
  departement text, naf_code text, person_type text,
  raw_data jsonb, extended_data jsonb,
  patrimony_score int, raison_principale text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  _wheres text[] := ARRAY[
    'patrimony_score IS NOT NULL',
    'enrichment_level IN (''standard'', ''deep'')'
  ];
  _sql text;
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
    'SELECT canonical_key, prenom, nom, siren, departement, naf_code, person_type, raw_data, extended_data, patrimony_score, raison_principale
     FROM prospection_persons
     WHERE %s
     ORDER BY patrimony_score DESC NULLS LAST, random()
     LIMIT %s',
    array_to_string(_wheres, ' AND '),
    p_limit::text
  );

  RETURN QUERY EXECUTE _sql;
END;
$fn$;
