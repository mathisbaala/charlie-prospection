-- Reclassification des 8 000 profils étiquetés 'autre_libéral'
-- vers leurs types explicites. Données disponibles à l'ingest :
--   - profession_libelle : libellé exact posé par chaque script
--   - naf_code : code NAF de la société (AE) ou NULL (RPPS individuel)

-- ── Santé RPPS (naf_code IS NULL = pas de société, profil individuel RPPS) ──

update prospection_persons set person_type = 'sage_femme'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%sage%femme%';

update prospection_persons set person_type = 'infirmier'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%infirmier%';

update prospection_persons set person_type = 'orthophoniste'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%orthophoniste%';

update prospection_persons set person_type = 'podologue'
  where person_type = 'autre_libéral'
    and naf_code is null
    and (profession_libelle ilike '%podologue%' or profession_libelle ilike '%pédicure%');

update prospection_persons set person_type = 'ergothérapeute'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%ergothérap%';

update prospection_persons set person_type = 'opticien'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%opticien%';

update prospection_persons set person_type = 'orthoptiste'
  where person_type = 'autre_libéral'
    and naf_code is null
    and profession_libelle ilike '%orthoptiste%';

-- ── Libéraux AE (naf_code disponible — discriminant fiable) ─────────────────

update prospection_persons set person_type = 'vétérinaire'
  where person_type = 'autre_libéral'
    and naf_code = '75.00Z';

update prospection_persons set person_type = 'architecte'
  where person_type = 'autre_libéral'
    and naf_code = '71.11Z';

update prospection_persons set person_type = 'géomètre'
  where person_type = 'autre_libéral'
    and naf_code = '71.12B'
    and profession_libelle ilike '%géomètre%';

update prospection_persons set person_type = 'ostéopathe'
  where person_type = 'autre_libéral'
    and naf_code = '86.90F'
    and profession_libelle ilike '%ostéopath%';

update prospection_persons set person_type = 'psychologue'
  where person_type = 'autre_libéral'
    and naf_code = '86.90F'
    and profession_libelle ilike '%psycholog%';

update prospection_persons set person_type = 'expert_judiciaire'
  where person_type = 'autre_libéral'
    and naf_code = '69.10Z'
    and profession_libelle ilike '%expert judiciaire%';

update prospection_persons set person_type = 'commissaire_priseur'
  where person_type = 'autre_libéral'
    and naf_code = '74.90Z';

update prospection_persons set person_type = 'agent_immobilier'
  where person_type = 'autre_libéral'
    and naf_code = '68.31Z'
    and profession_libelle ilike '%agent immobilier%';
