-- Two-tier admin access:
--   super_admin — full read/write/delete everywhere.
--   data_entry  — can INSERT new records (which land as 'pending' and do
--                 NOT feed the reminder engine or ritual templates until a
--                 super_admin approves them) and can read everything, but
--                 can never UPDATE or DELETE any row, existing or their own.
--
-- This is a separate concept from family_group_members.role
-- (keeper/organizer/member), which is about a family MEMBER's standing
-- within their own family, not about who operates this admin app.

create type admin_role as enum ('super_admin', 'data_entry');
create type approval_status as enum ('pending', 'approved', 'rejected');

create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role admin_role not null default 'data_entry',
  created_at timestamptz not null default now()
);

comment on table admin_users is 'App operators (you + any assistants), distinct from family_group_members which represents family recipients.';

alter table admin_users enable row level security;

-- ---------------------------------------------------------------------------
-- Role-check helpers used throughout RLS policies below.
--
-- MUST be security definer. admin_users itself has RLS enabled, and its own
-- policies call these same functions — a plain (invoker-rights) function
-- would have its internal SELECT re-subject to admin_users' RLS, which
-- again calls the function, recursing infinitely (confirmed by testing:
-- "stack depth limit exceeded"). security definer makes the internal
-- lookup bypass RLS entirely, which is safe here because these functions
-- only ever check auth.uid() — the caller's own identity, not something
-- they can spoof — and only ever return a boolean, never row data.
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$ language sql stable security definer set search_path = public;

create or replace function is_super_admin() returns boolean as $$
  select exists (select 1 from admin_users where id = auth.uid() and role = 'super_admin');
$$ language sql stable security definer set search_path = public;

-- Bootstrap note: the very first super_admin cannot be inserted through
-- these policies (nobody qualifies yet) — insert that one row directly via
-- the Supabase SQL Editor, using the project owner connection, which
-- bypasses RLS. See README.

create policy "self read" on admin_users for select using (id = auth.uid());
create policy "super admin reads all" on admin_users for select using (is_super_admin());
create policy "super admin manages admins" on admin_users for insert with check (is_super_admin());
create policy "super admin updates admins" on admin_users for update using (is_super_admin());
create policy "super admin removes admins" on admin_users for delete using (is_super_admin());

-- ---------------------------------------------------------------------------
-- Approval trigger — the client can send whatever it wants in status/
-- created_by/reviewed_by; this always overwrites those fields based on the
-- INSERTING user's actual role, so a data_entry admin cannot self-approve
-- by tampering with the request payload.
-- ---------------------------------------------------------------------------

create or replace function set_approval_on_insert()
returns trigger as $$
declare
  v_role admin_role;
begin
  select role into v_role from admin_users where id = auth.uid();
  if v_role is null then
    raise exception 'insert rejected: % is not a registered admin user', auth.uid();
  end if;

  new.created_by := auth.uid();

  if v_role = 'super_admin' then
    new.status := 'approved';
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

comment on function set_approval_on_insert is 'security definer so it can always resolve the inserting user''s role regardless of RLS on admin_users.';

-- ---------------------------------------------------------------------------
-- Add approval columns + trigger to the entity tables a data_entry admin
-- can create. (people, observance_types, ritual_templates are handled
-- differently below — see rationale there.)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['family_groups', 'ancestors', 'family_group_members', 'observance_instances', 'facility_renewals']
  loop
    execute format('alter table %I add column status approval_status not null default ''pending''', t);
    execute format('alter table %I add column created_by uuid references admin_users(id)', t);
    execute format('alter table %I add column reviewed_by uuid references admin_users(id)', t);
    execute format('alter table %I add column reviewed_at timestamptz', t);
    execute format('create trigger trg_set_approval before insert on %I for each row execute function set_approval_on_insert()', t);
    execute format('create index idx_%s_status on %I (status)', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Ritual template revisions — ritual_templates is a fixed one-row-per-type
-- lookup, so a data_entry admin's proposed change can't just be another
-- row with the same type_code. They propose a revision here instead; a
-- super_admin reviews it and applies it to the live ritual_templates row.
-- ---------------------------------------------------------------------------

create table ritual_template_revisions (
  id uuid primary key default gen_random_uuid(),
  type_code text not null references observance_types(code),
  location text,
  offerings_json jsonb,
  sequence_json jsonb,
  invocation_template text,
  notes text,
  taboos text,
  status approval_status not null default 'pending',
  created_by uuid references admin_users(id),
  reviewed_by uuid references admin_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ritual_template_revisions enable row level security;

create trigger trg_set_approval
before insert on ritual_template_revisions
for each row execute function set_approval_on_insert();

-- ---------------------------------------------------------------------------
-- Replace the old single "admin full access" policy on every table with
-- granular, role-aware policies. IMPORTANT: the old policy must be dropped,
-- not just superseded — Postgres OR's multiple permissive policies
-- together, so leaving it in place would silently keep granting everyone
-- full access regardless of the new restrictive policies below.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'people', 'family_groups', 'family_group_members', 'ancestors',
    'observance_types', 'observance_instances', 'ritual_templates',
    'facility_renewals', 'notifications'
  ]
  loop
    execute format('drop policy if exists "admin full access" on %I', t);
  end loop;
end $$;

-- Tables with approval status: any admin can read/insert, only a
-- super_admin can update or delete (including approving/rejecting a
-- pending row, which is just an UPDATE of its status).
do $$
declare
  t text;
begin
  foreach t in array array['family_groups', 'ancestors', 'family_group_members', 'observance_instances', 'facility_renewals']
  loop
    execute format('create policy "admins can read" on %I for select using (is_admin())', t);
    execute format('create policy "admins can insert" on %I for insert with check (is_admin())', t);
    execute format('create policy "super admin can update" on %I for update using (is_super_admin())', t);
    execute format('create policy "super admin can delete" on %I for delete using (is_super_admin())', t);
  end loop;
end $$;

-- people: no approval workflow of its own (a person only becomes a live
-- recipient once referenced by an approved family_group_members row), but
-- the same "no edit/delete for data_entry" rule still applies.
create policy "admins can read" on people for select using (is_admin());
create policy "admins can insert" on people for insert with check (is_admin());
create policy "super admin can update" on people for update using (is_super_admin());
create policy "super admin can delete" on people for delete using (is_super_admin());

-- observance_types: fixed system lookup — super_admin only, in every direction.
create policy "admins can read" on observance_types for select using (is_admin());
create policy "super admin can write" on observance_types for insert with check (is_super_admin());
create policy "super admin can update" on observance_types for update using (is_super_admin());
create policy "super admin can delete" on observance_types for delete using (is_super_admin());

-- ritual_templates: read by any admin; direct writes are super_admin only —
-- a data_entry admin must go through ritual_template_revisions instead.
create policy "admins can read" on ritual_templates for select using (is_admin());
create policy "super admin can write" on ritual_templates for insert with check (is_super_admin());
create policy "super admin can update" on ritual_templates for update using (is_super_admin());
create policy "super admin can delete" on ritual_templates for delete using (is_super_admin());

create policy "admins can read" on ritual_template_revisions for select using (is_admin());
create policy "admins can propose" on ritual_template_revisions for insert with check (is_admin());
create policy "super admin can update" on ritual_template_revisions for update using (is_super_admin());
create policy "super admin can delete" on ritual_template_revisions for delete using (is_super_admin());

-- notifications: read-only for both tiers via the client. Only the Edge
-- Function (service role key, which bypasses RLS entirely) writes here.
create policy "admins can read" on notifications for select using (is_admin());
