-- Étendre la check constraint person_type pour les nouvelles professions libérales
-- Ajout : courtier_assurance, conseiller_financier, huissier

alter table prospection_persons drop constraint if exists prospection_persons_person_type_check;

alter table prospection_persons add constraint prospection_persons_person_type_check
  check (person_type in (
    'dirigeant', 'médecin', 'kiné', 'dentiste', 'pharmacien',
    'avocat', 'notaire', 'expert_comptable', 'autre_libéral', 'autre',
    'courtier_assurance', 'conseiller_financier', 'huissier'
  ));
