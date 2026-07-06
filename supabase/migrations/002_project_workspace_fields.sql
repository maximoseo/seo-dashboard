-- Project workspace metadata fields for SEO Dashboard portfolio selector.
-- Review and apply after confirming production Supabase roles and tenant membership data.

alter table seo_domains
  add column if not exists name text,
  add column if not exists status text not null default 'active',
  add column if not exists priority text not null default 'medium',
  add column if not exists owner_email text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Bring legacy rows into compliance before validating the new constraints.
update seo_domains
set status = 'active'
where status is null or status not in ('active', 'ready', 'planned', 'paused', 'archived');

update seo_domains
set priority = 'medium'
where priority is null or priority not in ('primary', 'high', 'medium', 'low');

alter table seo_domains
  add constraint seo_domains_status_check
  check (status in ('active', 'ready', 'planned', 'paused', 'archived'))
  not valid;

alter table seo_domains
  add constraint seo_domains_priority_check
  check (priority in ('primary', 'high', 'medium', 'low'))
  not valid;

alter table seo_domains validate constraint seo_domains_status_check;
alter table seo_domains validate constraint seo_domains_priority_check;

create index if not exists seo_domains_status_idx on seo_domains(status);
create index if not exists seo_domains_priority_idx on seo_domains(priority);
create index if not exists seo_domains_owner_email_idx on seo_domains(owner_email);

-- Tenant membership table used by authenticated RLS policies.
-- Seed this table before enabling the scoped policies in an environment with existing authenticated users.
create table if not exists seo_client_members (
  client_id uuid not null references seo_clients(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

alter table seo_client_members enable row level security;
revoke all on seo_client_members from anon;

drop policy if exists seo_client_members_authenticated_self on seo_client_members;

create policy seo_client_members_authenticated_self on seo_client_members
  for select to authenticated
  using (user_id = auth.uid());

-- Replace the foundation migration's broad authenticated seo_domains policy with tenant-scoped checks.
drop policy if exists seo_domains_authenticated_all on seo_domains;
drop policy if exists seo_domains_authenticated_select on seo_domains;
drop policy if exists seo_domains_authenticated_insert on seo_domains;
drop policy if exists seo_domains_authenticated_update on seo_domains;
drop policy if exists seo_domains_authenticated_delete on seo_domains;

create policy seo_domains_authenticated_select on seo_domains
  for select to authenticated
  using (
    exists (
      select 1
      from seo_client_members member
      where member.client_id = seo_domains.client_id
        and member.user_id = auth.uid()
    )
  );

create policy seo_domains_authenticated_insert on seo_domains
  for insert to authenticated
  with check (
    exists (
      select 1
      from seo_client_members member
      where member.client_id = seo_domains.client_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

create policy seo_domains_authenticated_update on seo_domains
  for update to authenticated
  using (
    exists (
      select 1
      from seo_client_members member
      where member.client_id = seo_domains.client_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from seo_client_members member
      where member.client_id = seo_domains.client_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

create policy seo_domains_authenticated_delete on seo_domains
  for delete to authenticated
  using (
    exists (
      select 1
      from seo_client_members member
      where member.client_id = seo_domains.client_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

comment on policy seo_domains_authenticated_select on seo_domains is
  'Tenant scoped read access: authenticated users can read seo_domains rows, including owner_email/settings, only for client_id values listed in seo_client_members.';
comment on policy seo_domains_authenticated_insert on seo_domains is
  'Tenant scoped write access: only owner/admin members of the row client_id can insert seo_domains rows.';
comment on policy seo_domains_authenticated_update on seo_domains is
  'Tenant scoped write access: only owner/admin members of the row client_id can update seo_domains rows.';
comment on policy seo_domains_authenticated_delete on seo_domains is
  'Tenant scoped write access: only owner/admin members of the row client_id can delete seo_domains rows.';
