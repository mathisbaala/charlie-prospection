-- ─────────────────────────────────────────────────────────────────────────────
-- Couche Engagement — Campagnes LinkedIn
-- Owner: Associé
-- Tables: prospection_campaigns, prospection_campaign_steps,
--         prospection_campaign_enrollments, prospection_linkedin_sessions,
--         prospection_extension_link_tokens
-- ─────────────────────────────────────────────────────────────────────────────

-- Campagnes de prospection
create table prospection_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  emoji text not null default '🎯',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Étapes de séquence par campagne
create table prospection_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references prospection_campaigns(id) on delete cascade,
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  position integer not null,    -- 1, 2, 3…
  type text not null check (type in ('invitation', 'message')),
  delay_days integer not null default 0,
  template text not null default '',
  created_at timestamptz not null default now(),
  unique(campaign_id, position)
);

-- Enrôlements : quel prospect dans quelle campagne, à quel stade
create table prospection_campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references prospection_campaigns(id) on delete cascade,
  prospect_id uuid not null references prospection_prospects(id) on delete cascade,
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  status text not null default 'pending' check (status in (
    'pending',           -- en attente de traitement
    'profile_search',    -- recherche du profil LinkedIn en cours
    'invitation_sent',   -- invitation envoyée, attente d'acceptation
    'connected',         -- invitation acceptée
    'dm_sent',           -- premier DM envoyé
    'replied',           -- prospect a répondu
    'finished',          -- séquence terminée
    'failed',            -- erreur technique répétée
    'opted_out'          -- refus ou trop d'échecs
  )),
  current_step integer not null default 1,
  linkedin_url_resolved text,    -- URL LinkedIn trouvée par l'extension
  fail_count integer not null default 0,
  enrolled_at timestamptz not null default now(),
  last_action_at timestamptz,
  unique(campaign_id, prospect_id)
);

-- Sessions LinkedIn par utilisateur (cookie chiffré + api_token extension)
create table prospection_linkedin_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  li_at_encrypted text,          -- cookie li_at chiffré AES-256
  api_token text unique,         -- token long-lived pour l'extension (ext_{uuid})
  is_valid boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- Tokens courts pour lier l'extension (10 min, usage unique)
create table prospection_extension_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  token text unique not null,
  used boolean not null default false,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table prospection_campaigns enable row level security;
alter table prospection_campaign_steps enable row level security;
alter table prospection_campaign_enrollments enable row level security;
alter table prospection_linkedin_sessions enable row level security;
alter table prospection_extension_link_tokens enable row level security;

create policy "org members can manage campaigns"
  on prospection_campaigns for all
  using (org_id in (select my_org_ids()));

create policy "org members can manage campaign steps"
  on prospection_campaign_steps for all
  using (org_id in (select my_org_ids()));

create policy "org members can manage enrollments"
  on prospection_campaign_enrollments for all
  using (org_id in (select my_org_ids()));

create policy "users can manage their own linkedin sessions"
  on prospection_linkedin_sessions for all
  using (user_id = auth.uid());

create policy "users can manage their own link tokens"
  on prospection_extension_link_tokens for all
  using (user_id = auth.uid());

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index idx_campaigns_org on prospection_campaigns(org_id, status);
create index idx_campaign_steps_campaign on prospection_campaign_steps(campaign_id, position);
create index idx_enrollments_campaign on prospection_campaign_enrollments(campaign_id, status);
create index idx_enrollments_prospect on prospection_campaign_enrollments(prospect_id);
create index idx_enrollments_pending on prospection_campaign_enrollments(org_id, status, last_action_at)
  where status in ('pending', 'invitation_sent', 'connected');
create index idx_linkedin_sessions_token on prospection_linkedin_sessions(api_token);
create index idx_ext_link_tokens_token on prospection_extension_link_tokens(token, used, expires_at);
