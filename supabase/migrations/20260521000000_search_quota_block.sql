-- Quand LinkedIn affiche "You've reached the monthly limit for profile searches",
-- on positionne ce timestamp à fin de mois. Tant qu'il est dans le futur, le
-- backend ne génère plus de jobs profile_search pour ce compte → on évite de
-- gaspiller des cycles et d'envoyer un signal "bot" supplémentaire à LinkedIn.

alter table prospection_linkedin_sessions
  add column search_quota_blocked_until timestamptz;

comment on column prospection_linkedin_sessions.search_quota_blocked_until is
  'Si défini et futur, le backend ne planifie plus de profile_search pour cette session. Levé après cette date (fin du mois LinkedIn).';
