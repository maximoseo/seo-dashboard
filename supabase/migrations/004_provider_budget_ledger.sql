-- P1.2 / near-P0: durable, global provider budget ledger.
-- In-memory per-process counters cannot enforce a daily cap once Vercel scales to N instances
-- (each instance keeps its own count → up to N× overspend on paid providers). This moves the
-- reservation into Postgres so the cap is atomic and global across all instances.

create table if not exists seo_provider_budget (
  provider    text        not null,
  budget_day  date        not null,
  used        numeric     not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (provider, budget_day)
);

-- Atomic reserve: increment used by p_amount and return the NEW total in a single statement.
-- Concurrent callers serialize on the primary key, so no update is lost. The caller compares the
-- returned value to the provider cap and calls release_provider_budget when it is over.
create or replace function reserve_provider_budget(p_provider text, p_day date, p_amount numeric default 1)
returns numeric
language sql
as $$
  insert into seo_provider_budget as b (provider, budget_day, used, updated_at)
  values (p_provider, p_day, p_amount, now())
  on conflict (provider, budget_day)
  do update set used = b.used + excluded.used, updated_at = now()
  returning used;
$$;

-- Release a reservation (over-cap denial, or pre-provider failure). Never goes below zero.
create or replace function release_provider_budget(p_provider text, p_day date, p_amount numeric default 1)
returns numeric
language sql
as $$
  update seo_provider_budget
     set used = greatest(0, used - p_amount), updated_at = now()
   where provider = p_provider and budget_day = p_day
  returning used;
$$;

-- Server-internal table: only the service role should touch it. No policies => authenticated/anon denied.
alter table seo_provider_budget enable row level security;
