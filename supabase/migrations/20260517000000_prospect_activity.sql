-- Per-prospect activity log: free-form trail of interactions the operator
-- had with this prospect. Distinct from `prospection_outreach_messages`
-- which is reserved for the formal message-generation pipeline (email +
-- LinkedIn templated drafts). This table is a simple "what happened"
-- journal — notes, call summaries, meeting recaps.

create table prospection_prospect_activity (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospection_prospects(id) on delete cascade,
  org_id uuid not null references prospection_organizations(id) on delete cascade,
  kind text not null check (kind in (
    'note',             -- free-text note (observation, reminder, decision)
    'call',             -- phone call summary
    'email_sent',       -- email sent (manual log; the generated emails go to outreach_messages)
    'linkedin_message', -- LinkedIn message sent
    'meeting',          -- meeting / RDV held
    'other'
  )),
  body text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_prospect_activity_prospect_date
  on prospection_prospect_activity(prospect_id, occurred_at desc);

-- RLS: members of the prospect's org can read; only the author can mutate
-- their own entries (no overriding someone else's note).
alter table prospection_prospect_activity enable row level security;

create policy "members can view their org activity"
  on prospection_prospect_activity for select
  using (org_id in (select my_org_ids()));

create policy "members can insert activity in their org"
  on prospection_prospect_activity for insert
  with check (org_id in (select my_org_ids()));

create policy "authors can update their own activity"
  on prospection_prospect_activity for update
  using (created_by = auth.uid());

create policy "authors can delete their own activity"
  on prospection_prospect_activity for delete
  using (created_by = auth.uid());
