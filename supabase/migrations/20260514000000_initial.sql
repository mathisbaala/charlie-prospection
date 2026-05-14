-- Extensions
create extension if not exists "uuid-ossp";

-- Organizations (cabinets CGP)
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'starter' check (plan in ('starter', 'pro')),
  created_at timestamptz not null default now()
);

-- Organization members
create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- ICPs (Ideal Customer Profiles)
create table icps (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  raw_description text not null,
  parsed_criteria jsonb not null default '{}',
  linkedin_queries jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prospects
create table prospects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  icp_id uuid references icps(id) on delete set null,
  linkedin_url text not null,
  linkedin_data jsonb not null default '{}',
  enrichment_data jsonb not null default '{}',
  patrimony_score integer check (patrimony_score between 0 and 100),
  icp_score integer check (icp_score between 0 and 100),
  crm_stage text not null default 'new' check (
    crm_stage in ('new', 'to_contact', 'contacted', 'meeting', 'client', 'lost')
  ),
  created_at timestamptz not null default now(),
  last_signal_at timestamptz,
  unique(org_id, linkedin_url)
);

-- Signals
create table signals (
  id uuid primary key default uuid_generate_v4(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in (
    'cession_entreprise', 'levee_fonds', 'creation_holding', 'transaction_immo',
    'nouveau_poste', 'installation_cabinet', 'post_linkedin', 'retraite_imminente',
    'divorce', 'succession', 'augmentation_capital'
  )),
  source text not null check (source in (
    'bodacc', 'sirene', 'dvf', 'rpps', 'jo', 'linkedin', 'infogreffe'
  )),
  data jsonb not null default '{}',
  valeur_estimee numeric,
  detected_at timestamptz not null default now(),
  read boolean not null default false
);

-- Outreach messages
create table outreach_messages (
  id uuid primary key default uuid_generate_v4(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  channel text not null check (channel in ('linkedin', 'email')),
  content text not null,
  signals_used jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'replied')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: activer sur toutes les tables
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table icps enable row level security;
alter table prospects enable row level security;
alter table signals enable row level security;
alter table outreach_messages enable row level security;

-- Helper: org_ids de l'utilisateur courant
create or replace function my_org_ids()
returns setof uuid language sql security definer stable as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- RLS policies: organizations
create policy "members can view their org"
  on organizations for select
  using (id in (select my_org_ids()));

create policy "owners can update their org"
  on organizations for update
  using (id in (
    select org_id from organization_members
    where user_id = auth.uid() and role = 'owner'
  ));

-- RLS policies: organization_members
create policy "members can view org members"
  on organization_members for select
  using (org_id in (select my_org_ids()));

-- RLS policies: icps
create policy "org members can manage icps"
  on icps for all
  using (org_id in (select my_org_ids()));

-- RLS policies: prospects
create policy "org members can manage prospects"
  on prospects for all
  using (org_id in (select my_org_ids()));

-- RLS policies: signals
create policy "org members can manage signals"
  on signals for all
  using (org_id in (select my_org_ids()));

-- RLS policies: outreach_messages
create policy "org members can manage outreach"
  on outreach_messages for all
  using (org_id in (select my_org_ids()));

-- Indexes
create index idx_prospects_org_id on prospects(org_id);
create index idx_prospects_crm_stage on prospects(org_id, crm_stage);
create index idx_signals_prospect_id on signals(prospect_id);
create index idx_signals_org_unread on signals(org_id, read) where read = false;
create index idx_outreach_prospect_id on outreach_messages(prospect_id);
