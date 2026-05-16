-- supabase/migrations/20260519000000_persons_cache.sql

create table if not exists prospection_persons_cache (
  id uuid primary key default gen_random_uuid(),

  -- Clé de dédup (identique à RawProspect.uid = canonicalPersonKey)
  canonical_key text unique not null,

  -- Colonnes d'index pour le filtrage par critères
  siren          text,
  dirigeant_prenom text not null,
  dirigeant_nom    text not null,
  dirigeant_qualite text,
  dirigeant_annee_naissance integer,
  code_naf       text,
  departement    text,
  ville          text,

  -- Sources ayant découvert cette personne
  discovery_sources text[] not null default '{}',

  -- Blobs
  raw_data       jsonb not null,    -- snapshot RawProspect
  enrichment_data jsonb,            -- ProspectEnrichmentData (null = pas encore enrichi)

  -- Score patrimonial global (0-100)
  patrimony_score integer,

  -- Niveau d'enrichissement
  enrichment_level text not null default 'raw'
    check (enrichment_level in ('raw', 'standard')),

  -- Horodatage du dernier enrichissement
  last_enriched_at timestamptz,

  created_at timestamptz not null default now()
);

-- Lookup principal : critères persona (NAF + dept) + tri par score
create index idx_persons_cache_naf_dept
  on prospection_persons_cache(code_naf, departement, patrimony_score desc nulls last)
  where code_naf is not null and departement is not null;

-- Lookup dept seul (quand pas de NAF inféré)
create index idx_persons_cache_dept
  on prospection_persons_cache(departement)
  where departement is not null;

-- Lookup SIREN (signal matching, enrichissement portfolio)
create index idx_persons_cache_siren
  on prospection_persons_cache(siren)
  where siren is not null;

-- Staleness check pour le cron de ré-enrichissement
create index idx_persons_cache_stale
  on prospection_persons_cache(last_enriched_at asc nulls last)
  where enrichment_level = 'standard';

comment on table prospection_persons_cache is
  'Cache global cross-org. Toute personne jamais découverte y est stockée '
  'pour éviter les doublons d''appels API. Pas de RLS — accès service role '
  'uniquement. Le contexte org-specific (CRM, suivi) reste dans '
  'prospection_prospects.';
