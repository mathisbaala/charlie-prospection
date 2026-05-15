-- Global signals inbox: raw events ingested from public data sources
-- (BODACC, INPI, Pappers modifications). Matched to org ICPs by cron.
-- This table is GLOBAL across orgs and accessed only by service-role
-- cron jobs — RLS is intentionally disabled.

create table prospection_signals_inbox (
  id uuid primary key default uuid_generate_v4(),
  source text not null,                         -- 'bodacc' | 'inpi' | 'pappers_modif'
  external_id text not null,                    -- stable id from the source
  date_event timestamptz not null,
  siren text,
  entreprise_nom text,
  code_naf text,
  departement text,
  type_event text not null,                     -- 'cession' | 'creation' | 'modif_capital' | ...
  raw_data jsonb not null,
  matched_org_ids uuid[] not null default '{}', -- orgs whose active ICP matches this signal
  ingested_at timestamptz not null default now(),
  unique(source, external_id)
);

-- Cron 'match-icps' scans recent unmatched signals
create index idx_signals_inbox_unmatched
  on prospection_signals_inbox(date_event desc)
  where array_length(matched_org_ids, 1) is null;

-- Filter by NAF + departement (the ICP matching keys)
create index idx_signals_inbox_naf_dept
  on prospection_signals_inbox(code_naf, departement, date_event desc);

-- Intelligence strip lookup: signals matched to a specific org over the last N days
create index idx_signals_inbox_matched_orgs
  on prospection_signals_inbox using gin (matched_org_ids);

-- ── Matching RPC ───────────────────────────────────────────────────────────
-- Used by /api/cron/match-icps: atomically append an org_id to every signal
-- whose (code_naf, departement) intersects the ICP's NAF + dept filters AND
-- that doesn't already list the org. Returns the affected signal ids.
create or replace function append_matched_org_to_signals(
  p_org_id uuid,
  p_naf_codes text[],
  p_departements text[],
  p_since timestamptz
)
returns table (signal_id uuid)
language sql as $$
  update prospection_signals_inbox s
  set matched_org_ids = array_append(s.matched_org_ids, p_org_id)
  where not (p_org_id = any(s.matched_org_ids))
    and s.date_event >= p_since
    and (
      coalesce(array_length(p_naf_codes, 1), 0) = 0
      or s.code_naf = any(p_naf_codes)
    )
    and (
      coalesce(array_length(p_departements, 1), 0) = 0
      or s.departement = any(p_departements)
    )
    -- Refuse to match an "empty ICP" (no NAF + no dept) — would flag everything
    and (
      coalesce(array_length(p_naf_codes, 1), 0) > 0
      or coalesce(array_length(p_departements, 1), 0) > 0
    )
  returning s.id;
$$;
