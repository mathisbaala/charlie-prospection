-- RPPS cache: professionals from the data.gouv.fr RPPS registry (monthly snapshot).
-- Populated by /api/cron/refresh-rpps. Used by lib/discovery/rpps.ts for discovery.
-- Schema aligned with the CSV columns from data.gouv.fr "Extraction de la base RPPS".

create table prospection_rpps_cache (
  rpps_id         text        primary key,
  nom             text        not null,
  prenom          text,
  profession      text        not null,      -- 'Médecin', 'Chirurgien-Dentiste', ...
  specialite      text,                      -- libellé catégorie professionnelle
  mode_exercice   char(1)     not null,      -- 'L' libéral, 'S' salarié, 'B' bénévole
  ville           text,
  code_postal     text,
  updated_at      timestamptz not null default now()
);

-- Discovery queries filter by profession and code_postal prefix (dept = first 2 digits).
create index idx_rpps_profession_postal
  on prospection_rpps_cache (profession, code_postal);

-- Enables fast "is the cache stale?" check without scanning all rows.
create index idx_rpps_updated_at
  on prospection_rpps_cache (updated_at desc);
