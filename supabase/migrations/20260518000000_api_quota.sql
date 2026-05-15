-- Daily API call counter, used to protect against runaway costs on metered
-- external sources (Pappers being the primary motivation). Single row per
-- (source, date). Concurrency-safe via the increment_api_quota RPC.

create table prospection_api_quota (
  source text not null,
  date date not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (source, date)
);

-- Read-only index for "today's count" lookups.
create index idx_api_quota_date on prospection_api_quota(date desc);

-- Atomic increment with cap check. Returns the new count after increment,
-- or -1 if the cap would be exceeded (no row touched in that case).
create or replace function increment_api_quota(
  p_source text,
  p_cap int,
  p_today date default current_date
)
returns int
language plpgsql
security definer
as $$
declare
  v_new_count int;
begin
  -- Upsert + return the post-increment count. ON CONFLICT updates atomically.
  insert into prospection_api_quota (source, date, count)
    values (p_source, p_today, 1)
    on conflict (source, date)
      do update set count = prospection_api_quota.count + 1,
                    updated_at = now()
    returning count into v_new_count;

  -- Cap check happens AFTER the increment. If we just went over, decrement
  -- and signal the caller. This means at most one over-cap row exists per
  -- day, which is acceptable (transient) — we prefer simple atomic increment
  -- over a select-then-write race.
  if v_new_count > p_cap then
    update prospection_api_quota
      set count = count - 1
      where source = p_source and date = p_today;
    return -1;
  end if;

  return v_new_count;
end;
$$;

-- Read-only helper for dashboards / observability — get today's count for
-- a single source without incrementing.
create or replace function get_api_quota(
  p_source text,
  p_today date default current_date
)
returns int
language sql
security definer
as $$
  select coalesce(count, 0)
    from prospection_api_quota
    where source = p_source and date = p_today;
$$;
