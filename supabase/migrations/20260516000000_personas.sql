-- Multi-persona support on prospection_icps.
--
-- Today the app enforces a "1 active ICP per org" rule in code (parse route)
-- but the schema doesn't constrain it. We lift the application rule by adding
-- a `name` column so users can save N distinct personas, and a `strict_filters`
-- JSONB map so each criterion can be flagged as "weight strongly in score"
-- (interpretation chosen by the owner: soft ranking, not hard exclusion).

alter table prospection_icps
  add column name text,
  add column strict_filters jsonb not null default '{}'::jsonb;

-- Backfill existing rows: derive a default name from raw_description.
update prospection_icps
  set name = coalesce(nullif(left(raw_description, 60), ''), 'Persona principale')
  where name is null;

alter table prospection_icps alter column name set not null;

-- Prevent duplicate persona names within an org (case-insensitive).
create unique index idx_prospection_icps_org_name
  on prospection_icps(org_id, lower(name));

-- Index for the Cible tab persona list.
create index idx_prospection_icps_org_updated
  on prospection_icps(org_id, updated_at desc);
