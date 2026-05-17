-- Limites quotidiennes par session LinkedIn (= par utilisateur).
-- Permet à chaque user de régler ses propres limites depuis l'UI sans changer
-- les constantes hardcodées de DAILY_LIMITS. Défauts conformes aux zones de
-- sécurité LinkedIn (30 invitations/jour est le seuil au-delà duquel le risque
-- de ban temporaire augmente fortement).

alter table prospection_linkedin_sessions
  add column daily_invitation_limit int not null default 30,
  add column daily_dm_limit int not null default 50,
  add column daily_check_connection_limit int not null default 100;
