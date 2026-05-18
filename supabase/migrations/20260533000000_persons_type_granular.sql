-- Granularité des person_type : chaque profession a son propre type explicite.
-- Supprime le fourre-tout "autre_libéral" pour la plupart des professions connues.
-- autre_libéral reste en dernier recours pour les profils non classifiés.

alter table prospection_persons drop constraint if exists prospection_persons_person_type_check;

alter table prospection_persons add constraint prospection_persons_person_type_check
  check (person_type in (
    -- Dirigeants
    'dirigeant',
    -- Santé — professions médicales
    'médecin', 'dentiste', 'pharmacien', 'kiné', 'biologiste_médical',
    'sage_femme', 'infirmier', 'orthophoniste', 'podologue', 'ergothérapeute',
    'opticien', 'orthoptiste', 'audioprothésiste',
    -- Droit
    'avocat', 'notaire', 'huissier', 'greffier',
    'expert_judiciaire', 'commissaire_priseur',
    'commissaire_aux_comptes', 'expert_comptable', 'conseil_pi',
    -- Finance & assurance
    'conseiller_financier', 'courtier_assurance',
    -- Libéraux divers
    'architecte', 'vétérinaire', 'géomètre',
    'ostéopathe', 'psychologue', 'agent_immobilier',
    -- Fallback
    'autre_libéral', 'autre'
  ));

-- Backfill : corriger les profils biologistes mal taggés 'médecin'
-- (ingest-biologistes-medicaux.ts utilisait 'médecin' par erreur)
update prospection_persons
set person_type = 'biologiste_médical'
where person_type = 'médecin'
  and (
    profession_libelle ilike '%biologiste%'
    or naf_code = '86.90B'
  );
