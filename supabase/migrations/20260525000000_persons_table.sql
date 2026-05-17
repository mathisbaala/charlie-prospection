-- supabase/migrations/20260525000000_persons_table.sql
--
-- Base interne de toutes les personnes ciblables.
--
-- Modèle Push : les fondateurs alimentent via POST /api/admin/ingest/persons
-- (CSV, scraping, RPPS, Pappers bulk…). Un cron async enrichit les entrées
-- 'raw'. Les CGP recherchent uniquement dans cette table — aucun appel API
-- externe au moment de la recherche.
--
-- Standardisé pour tous les types de personnes : dirigeants, médecins, kinés,
-- dentistes, pharmaciens, avocats, notaires, experts-comptables, libéraux divers.
-- Les champs explicites couvrent le filtrage/scoring. extended_data absorbe
-- l'enrichissement profond (Pappers Premium, BODACC, DVF, presse…).

create table if not exists prospection_persons (
  id                uuid        primary key default gen_random_uuid(),

  -- Clé de dédup cross-source : canonicalPersonKey(prenom, nom, siren?)
  canonical_key     text        unique not null,

  -- Identité
  prenom            text        not null,
  nom               text        not null,
  annee_naissance   integer,

  -- Type de personne (axe principal de filtrage par persona)
  person_type       text        not null default 'dirigeant'
    check (person_type in (
      'dirigeant', 'médecin', 'kiné', 'dentiste', 'pharmacien',
      'avocat', 'notaire', 'expert_comptable', 'autre_libéral', 'autre'
    )),

  -- Libellé métier libre (ex : "Médecin généraliste", "Kinésithérapeute diplômé d'État")
  profession_libelle text,

  -- Identifiants professionnels
  rpps_number       text,      -- Professionnels de santé (RPPS open data)
  siren             text,      -- SIREN de la société principale (dirigeants, libéraux en société)
  siret             text,      -- SIRET de l'établissement principal

  -- Activité économique
  naf_code          text,
  naf_libelle       text,
  entreprise_nom    text,

  -- Localisation
  departement       text,
  ville             text,
  adresse           text,
  code_postal       text,

  -- Présence en ligne
  linkedin_url      text,

  -- Traçabilité des sources d'alimentation
  ingest_sources    text[]     not null default '{}',

  -- Snapshot RawProspect pour compatibilité avec enrichProspect()
  raw_data          jsonb,

  -- Enrichissement complet : ProspectEnrichmentData + scoring détaillé
  extended_data     jsonb,

  -- Score patrimonial global (0–100)
  patrimony_score   integer,
  raison_principale text,

  -- Niveau d'enrichissement
  enrichment_level  text        not null default 'raw'
    check (enrichment_level in ('raw', 'standard', 'dropped')),

  enriched_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Recherche santé : person_type + département + score
create index idx_persons_type_dept_score
  on prospection_persons(person_type, departement, patrimony_score desc nulls last)
  where enrichment_level = 'standard';

-- Recherche dirigeants : NAF + département + score
create index idx_persons_naf_dept_score
  on prospection_persons(naf_code, departement, patrimony_score desc nulls last)
  where enrichment_level = 'standard';

-- SIREN lookup (signal matching, portfolio SCI/holdings)
create index idx_persons_siren
  on prospection_persons(siren)
  where siren is not null;

-- RPPS lookup (dédup health professionals)
create index idx_persons_rpps
  on prospection_persons(rpps_number)
  where rpps_number is not null;

-- Cron enrich-persons : FIFO sur les entrées non encore enrichies
create index idx_persons_raw_created
  on prospection_persons(created_at asc)
  where enrichment_level = 'raw';

comment on table prospection_persons is
  'Base interne des personnes ciblables. Alimentée par les fondateurs via '
  'POST /api/admin/ingest/persons. Enrichissement async par le cron '
  'enrich-persons. La recherche CGP interroge uniquement cette table — '
  'zéro appel externe à la recherche.';
