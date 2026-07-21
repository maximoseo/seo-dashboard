-- White-label scheduled reports
-- Apply in Supabase after reviewing project roles. Stores per-domain report schedules
-- with white-label branding; a cron endpoint sends due reports via Resend.

create table if not exists seo_report_schedules (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references seo_domains(id) on delete cascade,
  template text not null default 'monthly' check (template in ('weekly', 'monthly', 'executive', 'local-geo')),
  locale text not null default 'he' check (locale in ('he', 'en')),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly')),
  recipients text[] not null default '{}',
  brand_name text,
  brand_color text,
  client_name text,
  market text,
  enabled boolean not null default true,
  send_day int not null default 1,
  send_hour int not null default 8,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_report_schedules_due_idx
  on seo_report_schedules (enabled, next_run_at);

create index if not exists seo_report_schedules_domain_idx
  on seo_report_schedules (domain_id);

alter table seo_report_schedules enable row level security;

-- Service role full access (dashboard server uses service role).
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'seo_report_schedules' and policyname = 'service_role_all'
  ) then
    create policy service_role_all on seo_report_schedules
      for all to service_role
      using (true) with check (true);
  end if;
end $$;
