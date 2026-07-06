-- SEO Dashboard foundation schema
-- Apply in Supabase after reviewing project-specific roles and environment-specific tenant rules.

create table if not exists seo_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists seo_domains (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references seo_clients(id) on delete cascade,
  domain text not null,
  market text,
  created_at timestamptz not null default now(),
  unique(client_id, domain)
);

create table if not exists seo_snapshots (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid references seo_domains(id) on delete cascade,
  provider text not null,
  snapshot_date date not null default current_date,
  data jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique(domain_id, provider, snapshot_date)
);

create table if not exists seo_alerts (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid references seo_domains(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  module text not null,
  title text not null,
  detail text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'assigned', 'working', 'fixed', 'verified', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seo_tasks (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references seo_alerts(id) on delete set null,
  domain_id uuid references seo_domains(id) on delete cascade,
  title text not null,
  status text not null default 'queued' check (status in ('queued', 'working', 'blocked', 'verified')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  brief text not null,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table seo_clients enable row level security;
alter table seo_domains enable row level security;
alter table seo_snapshots enable row level security;
alter table seo_alerts enable row level security;
alter table seo_tasks enable row level security;

revoke all on seo_clients, seo_domains, seo_snapshots, seo_alerts, seo_tasks from anon;

create policy seo_clients_authenticated_all on seo_clients
  for all to authenticated
  using (true)
  with check (true);

create policy seo_domains_authenticated_all on seo_domains
  for all to authenticated
  using (true)
  with check (true);

create policy seo_snapshots_authenticated_all on seo_snapshots
  for all to authenticated
  using (true)
  with check (true);

create policy seo_alerts_authenticated_all on seo_alerts
  for all to authenticated
  using (true)
  with check (true);

create policy seo_tasks_authenticated_all on seo_tasks
  for all to authenticated
  using (true)
  with check (true);
