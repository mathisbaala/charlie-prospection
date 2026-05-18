-- Reclassification des résidus autre_libéral.
-- Experts judiciaires (NAF 69.10Z) — non couverts par le backfill précédent.
-- Mandataires en propriété industrielle (CNCPI) — profession_libelle explicite.

UPDATE prospection_persons
SET person_type = 'expert_judiciaire'
WHERE person_type = 'autre_libéral'
  AND naf_code = '69.10Z'
  AND profession_libelle ILIKE '%expert judiciaire%';

UPDATE prospection_persons
SET person_type = 'conseil_pi'
WHERE person_type = 'autre_libéral'
  AND naf_code = '69.10Z'
  AND (profession_libelle ILIKE '%propriété industrielle%'
    OR profession_libelle ILIKE '%mandataire en brevet%');
