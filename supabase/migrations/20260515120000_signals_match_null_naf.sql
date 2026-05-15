-- Fix matching RPC: let signals with NULL code_naf pass the NAF filter.
--
-- BODACC's annonces-commerciales endpoint does not publish a NAF code per
-- record (entity NAF is a SIRENE-side attribute). Without this change, ICPs
-- whose roles derive a non-empty NAF list (the typical case) would filter
-- out every BODACC signal because `NULL = ANY(...)` evaluates to NULL.
--
-- Semantics: when code_naf is null on the signal, we trust the départment
-- filter alone. Precision is traded for recall — false positives are caught
-- by the downstream SIRENE enrichment that runs when an operator opens a
-- prospect, not in this matching cron.
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
      or s.code_naf is null
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
