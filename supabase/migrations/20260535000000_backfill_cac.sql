-- Reclassification des commissaires aux comptes résiduels.
-- Source : ingest-experts-comptables.ts (NAF 69.20Z) — les CAC étaient taggés
-- 'autre_libéral' avant que le type 'commissaire_aux_comptes' existe.
-- Le backfill précédent (20260534) avait omis ce cas.

update prospection_persons
set person_type = 'commissaire_aux_comptes'
where person_type = 'autre_libéral'
  and naf_code = '69.20Z'
  and profession_libelle ilike '%commissaire%';

-- Même correction pour les expert_comptable incorrectement classifiés CAC
-- (le script EC distinguait via mot-clé dans le nom société, pas profession_libelle)
update prospection_persons
set person_type = 'commissaire_aux_comptes'
where person_type = 'expert_comptable'
  and naf_code = '69.20Z'
  and profession_libelle ilike '%commissaire aux comptes%';
