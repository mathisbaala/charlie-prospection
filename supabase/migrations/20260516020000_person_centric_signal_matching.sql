-- Person-centric signal matching — étend le pipeline pour matcher les
-- signaux sur TOUTES les sociétés d'une personne, pas juste la principale.
--
-- Principe directeur (cf. CLAUDE.md) : un prospect est UNE PERSONNE, pas
-- une société. Quand un signal BODACC/Sirene/INPI tombe sur une SCI ou
-- une holding du dirigeant, c'est un signal patrimonial sur la personne
-- qui doit remonter dans son onglet Signaux, pas être oublié.
--
-- Source des sociétés annexes : `enrichment_data->'personal_portfolio'->'entites'`
-- populé par lib/enrichment/personal-portfolio.ts au moment de l'ajout au /suivi.

-- 1. Helper read-only : retourne TOUS les SIRENs rattachés à un prospect
-- (principale + portfolio). Utilisé par les deux RPCs ci-dessous.

create or replace function prospect_tracked_sirens(p_prospect_id uuid)
returns table (siren text)
language sql
security definer
stable
as $$
  with prospect_row as (
    select enrichment_data from prospection_prospects where id = p_prospect_id
  ),
  principal as (
    select pr.enrichment_data->>'siren' as siren
    from prospect_row pr
    where pr.enrichment_data ? 'siren' and pr.enrichment_data->>'siren' is not null
  ),
  portfolio as (
    select entite->>'siren' as siren
    from prospect_row pr,
         jsonb_array_elements(coalesce(pr.enrichment_data->'personal_portfolio'->'entites', '[]'::jsonb)) as entite
    where entite ? 'siren' and entite->>'siren' is not null
  )
  select siren from principal
  union
  select siren from portfolio;
$$;

-- 2. Backfill mis à jour — accepte un array de SIRENs (incl. portfolio).
--
-- Garde le signature ancienne (single siren) pour back-compat des callers
-- non encore migrés ; ajoute une version `_v2` qui prend un array.

create or replace function backfill_signals_for_prospect_v2(
  p_prospect_id uuid,
  p_org_id uuid,
  p_sirens text[],
  p_since timestamptz default (now() - interval '1 year')
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  if p_sirens is null or array_length(p_sirens, 1) is null then
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
      'siren', s.siren,
      'code_naf', s.code_naf,
      'departement', s.departement,
      'inbox_id', s.id,
      'inbox_source', s.source,
      'inbox_external_id', s.external_id,
      -- Marque si ce signal est sur la société principale ou une annexe
      'on_principal_siren', s.siren = (
        select pp.enrichment_data->>'siren'
        from prospection_prospects pp
        where pp.id = p_prospect_id
      )
    ),
    s.date_event
  from prospection_signals_inbox s
  where s.siren = any(p_sirens)
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

-- 3. Forward-matching réécrit — joint via prospect_tracked_sirens() pour
-- couvrir le portefeuille complet.
--
-- Remplace le matching uniquement-sur-siren-principal de la v1. Le nom
-- de la fonction reste identique pour ne pas casser le cron existant.

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
        'siren', s.siren,
        'code_naf', s.code_naf,
        'departement', s.departement,
        'inbox_id', s.id,
        'inbox_source', s.source,
        'inbox_external_id', s.external_id,
        -- Marque la nature du SIREN matché — utile au scorer pour pondérer
        'on_principal_siren', s.siren = (p.enrichment_data->>'siren')
      ),
      s.date_event
    from prospection_signals_inbox s
    join prospection_prospects p
      on p.icp_id is not null -- uniquement les prospects en suivi
     and s.siren in (select ts.siren from prospect_tracked_sirens(p.id) ts)
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
