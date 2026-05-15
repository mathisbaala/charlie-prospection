-- Per-prospect signal pipeline.
--
-- The existing match-icps cron flags inbox rows org-wide via matched_org_ids[],
-- which is noisy: every signal whose NAF+dept intersects an ICP is surfaced to
-- the whole org, regardless of whether the org actually tracks the entity.
--
-- This migration introduces two RPCs:
--   * backfill_signals_for_prospect: called when a candidate is added to
--     /suivi, imports up to 1y of past signals for that prospect's SIREN
--   * emit_signals_for_tracked_sirens: daily forward-match — joins new inbox
--     rows to prospects in /suivi by SIREN, idempotent insert
--
-- Both write to prospection_signals (the per-prospect table that already
-- exists since the initial migration but was effectively unused).

-- 1) Indexes ──────────────────────────────────────────────────────────────

-- Lookup by SIREN on the firehose (used by both RPCs below).
create index if not exists idx_signals_inbox_siren_date
  on prospection_signals_inbox(siren, date_event desc)
  where siren is not null;

-- Timeline ordering on the per-prospect store (UI fiche tab).
create index if not exists idx_prospection_signals_prospect_date
  on prospection_signals(prospect_id, detected_at desc);

-- Idempotency for both backfill and forward-match.
-- Composite key: same prospect + same source + same type + same exact moment
-- means we've already inserted this signal — `on conflict do nothing`.
create unique index if not exists uq_prospection_signals_prospect_dedup
  on prospection_signals(prospect_id, source, type, detected_at);

-- Functional index so the SIREN join in emit_signals_for_tracked_sirens stays cheap.
create index if not exists idx_prospects_siren
  on prospection_prospects ((enrichment_data->>'siren'))
  where enrichment_data ? 'siren';

-- 2) Extend type/source check constraints ──────────────────────────────────
--
-- prospection_signals.type was defined against the legacy SignalType union.
-- The InboxEventType (used by the firehose) has additional values we want to
-- write through directly without lossy mapping. We extend both checks.

alter table prospection_signals drop constraint if exists prospection_signals_type_check;
alter table prospection_signals add constraint prospection_signals_type_check
  check (type in (
    -- Legacy SignalType union (kept for existing rows + ad-hoc inserts)
    'cession_entreprise', 'levee_fonds', 'creation_holding', 'transaction_immo',
    'nouveau_poste', 'installation_cabinet', 'post_linkedin', 'retraite_imminente',
    'divorce', 'succession', 'augmentation_capital',
    -- InboxEventType — added so per-prospect signals can mirror the firehose
    'cession', 'creation', 'radiation', 'modification', 'procedure_collective',
    'modif_capital', 'modif_beneficiaire', 'depot_comptes', 'autre'
  ));

alter table prospection_signals drop constraint if exists prospection_signals_source_check;
alter table prospection_signals add constraint prospection_signals_source_check
  check (source in (
    -- Legacy
    'bodacc', 'sirene', 'dvf', 'rpps', 'jo', 'linkedin', 'infogreffe',
    -- New (firehose sources)
    'pappers', 'inpi'
  ));

-- 3) RPC: backfill_signals_for_prospect ────────────────────────────────────
-- Called at /suivi/add time. Pulls up to p_since (default 1y) of inbox rows
-- matching the prospect's SIREN and writes them into prospection_signals.
-- Tous types d'événements (y compris depot_comptes) — décision du owner.
-- Returns the number of new rows inserted.

create or replace function backfill_signals_for_prospect(
  p_prospect_id uuid,
  p_org_id uuid,
  p_siren text,
  p_since timestamptz default (now() - interval '1 year')
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  if p_siren is null or length(p_siren) < 9 then
    return 0;
  end if;

  insert into prospection_signals (prospect_id, org_id, type, source, data, detected_at)
  select
    p_prospect_id,
    p_org_id,
    s.type_event,
    case s.source
      when 'pappers_modif' then 'pappers'
      else s.source
    end,
    jsonb_build_object(
      'libelle', coalesce(
        s.raw_data->>'typeavis_lib',
        s.raw_data->>'familleavis_lib',
        s.type_event
      ),
      'entreprise_nom', s.entreprise_nom,
      'code_naf', s.code_naf,
      'departement', s.departement,
      'inbox_id', s.id,
      'inbox_source', s.source,
      'inbox_external_id', s.external_id
    ),
    s.date_event
  from prospection_signals_inbox s
  where s.siren = p_siren
    and s.date_event >= p_since
  on conflict (prospect_id, source, type, detected_at) do nothing;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    update prospection_prospects
      set last_signal_at = (
        select max(detected_at)
        from prospection_signals
        where prospect_id = p_prospect_id
      )
      where id = p_prospect_id;
  end if;

  return v_count;
end;
$$;

-- 4) RPC: emit_signals_for_tracked_sirens ─────────────────────────────────
-- Daily forward-match. Called from the match-icps cron after the org-wide
-- pass. Joins fresh inbox rows to prospects in /suivi (icp_id not null) by
-- SIREN and inserts deduped per-prospect signals.
-- Window defaults to 2 days so a cron failure has a one-day retry buffer.

create or replace function emit_signals_for_tracked_sirens(
  p_since timestamptz default (now() - interval '2 days')
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  with new_signals as (
    insert into prospection_signals (prospect_id, org_id, type, source, data, detected_at)
    select
      p.id,
      p.org_id,
      s.type_event,
      case s.source
        when 'pappers_modif' then 'pappers'
        else s.source
      end,
      jsonb_build_object(
        'libelle', coalesce(
          s.raw_data->>'typeavis_lib',
          s.raw_data->>'familleavis_lib',
          s.type_event
        ),
        'entreprise_nom', s.entreprise_nom,
        'code_naf', s.code_naf,
        'departement', s.departement,
        'inbox_id', s.id,
        'inbox_source', s.source,
        'inbox_external_id', s.external_id
      ),
      s.date_event
    from prospection_signals_inbox s
    join prospection_prospects p
      on p.enrichment_data->>'siren' = s.siren
     and p.icp_id is not null  -- only prospects in /suivi
    where s.siren is not null
      and s.date_event >= p_since
    on conflict (prospect_id, source, type, detected_at) do nothing
    returning prospect_id, detected_at
  ),
  bump as (
    update prospection_prospects p
      set last_signal_at = ns.max_d
      from (
        select prospect_id, max(detected_at) as max_d
        from new_signals
        group by prospect_id
      ) ns
      where p.id = ns.prospect_id
      returning 1
  )
  select count(*)::int into v_count from new_signals;

  return coalesce(v_count, 0);
end;
$$;
