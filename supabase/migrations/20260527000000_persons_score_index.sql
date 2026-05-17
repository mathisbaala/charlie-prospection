-- Index composite pour accélérer queryPersons :
-- filtre par departement + tri par patrimony_score DESC sur prospection_persons

CREATE INDEX IF NOT EXISTS idx_persons_dept_score
  ON prospection_persons (departement, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;

-- Index complémentaire pour les filtres NAF (sans département)
CREATE INDEX IF NOT EXISTS idx_persons_naf_score
  ON prospection_persons (naf_code, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;

-- Index complémentaire pour les filtres person_type (professions de santé RPPS)
-- Note: cet index doit être utilisé avec une equality simple (person_type = $1),
-- PAS avec person_type = ANY($1) qui force un Bitmap Heap Scan + Sort (x2700 plus lent).
CREATE INDEX IF NOT EXISTS idx_persons_type_score
  ON prospection_persons (person_type, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;

-- Fonction SECURITY DEFINER qui :
-- 1. Override le statement_timeout (3s PostgREST free tier → 30s)
-- 2. Utilise EXECUTE dynamique avec equality simple pour bénéficier de l'ordre de l'index
--    (évite le Bitmap Heap Scan + Sort de 24s sur 80k médecins)
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
  _wheres text[] := ARRAY['patrimony_score IS NOT NULL'];
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
    'SELECT canonical_key, prenom, nom, siren, departement, naf_code, person_type, raw_data, extended_data, patrimony_score, raison_principale FROM prospection_persons WHERE %s ORDER BY patrimony_score DESC NULLS LAST LIMIT %s',
    array_to_string(_wheres, ' AND '),
    p_limit::text
  );

  RETURN QUERY EXECUTE _sql;
END;
$fn$;
