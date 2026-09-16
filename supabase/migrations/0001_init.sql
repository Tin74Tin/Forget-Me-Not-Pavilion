-- Prayers Reminder — initial schema
-- Single-admin, multi-family model: one operator (you) manages many unrelated
-- families. Family members receive WhatsApp reminders but do not log in.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type calendar_basis as enum ('lunar', 'solar_term', 'day_offset');
create type recurrence_type as enum ('once', 'yearly', 'monthly');
create type observance_scope as enum ('per_ancestor', 'per_family_group');
create type contact_channel as enum ('whatsapp', 'sms', 'email', 'push');
create type member_role as enum ('keeper', 'organizer', 'member');
create type notification_status as enum ('pending', 'sent', 'failed', 'acknowledged');
create type dialect_pref as enum ('hokkien', 'teochew', 'cantonese', 'hakka', 'mandarin', 'other');
create type leap_handling as enum ('observe_in_leap_month', 'observe_in_following_month');

-- ---------------------------------------------------------------------------
-- Core people & family structure
-- ---------------------------------------------------------------------------

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_channel contact_channel not null default 'whatsapp',
  contact_value text not null, -- e.g. +65XXXXXXXX for whatsapp/sms, or email address
  secondary_contact_channel contact_channel,
  secondary_contact_value text,
  timezone text not null default 'Asia/Singapore',
  preferred_language text not null default 'en' check (preferred_language in ('en', 'zh')),
  digest_mode boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table people is 'A real individual. One row regardless of how many family groups they belong to (e.g. their own side + their spouse''s side).';

create table family_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dialect dialect_pref not null default 'mandarin',
  default_send_time_local time not null default '08:00',
  notes text,
  created_at timestamptz not null default now()
);

comment on table family_groups is 'One per ancestral line / unrelated family managed in this app.';

create table family_group_members (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references family_groups(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  relationship text not null, -- free text, e.g. "eldest son", "daughter-in-law"
  role member_role not null default 'member',
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  unique (family_group_id, person_id)
);

comment on table family_group_members is 'Join table enabling one person to belong to multiple family groups with a different relationship/role in each.';

-- ---------------------------------------------------------------------------
-- Ancestors
-- ---------------------------------------------------------------------------

create table ancestors (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references family_groups(id) on delete cascade,
  name text not null,
  tablet_name text,
  dob_solar date,
  dod_lunar_month smallint not null check (dod_lunar_month between 1 and 12),
  dod_lunar_day smallint not null check (dod_lunar_day between 1 and 30),
  dod_is_leap boolean not null default false,
  dod_is_approximate boolean not null default false,
  dod_solar_reference date not null, -- the original Gregorian date of death, anchor for one-time milestones
  leap_month_handling leap_handling not null default 'observe_in_following_month',
  observance_offset_days smallint not null default 0, -- signed; e.g. -1 for 忌日提前
  combined_with_sannian boolean not null default false,
  resting_place text,
  photo_url text,
  created_at timestamptz not null default now()
);

comment on column ancestors.dod_is_leap is 'True if the ancestor died during a leap lunar month.';
comment on column ancestors.leap_month_handling is 'How to observe the anniversary in an ordinary (non-leap) year when the death fell in a leap month.';
comment on column ancestors.observance_offset_days is 'Signed day offset applied to the computed lunar date, e.g. -1 for families who observe the rite one day before (忌日提前).';

-- ---------------------------------------------------------------------------
-- Observance types (lookup) & instances
-- ---------------------------------------------------------------------------

create table observance_types (
  code text primary key,
  calendar_basis calendar_basis not null,
  recurrence recurrence_type not null,
  scope observance_scope not null,
  default_label text not null,
  default_lead_days int[] not null default '{30,14,7,3,1,0}'
);

create table observance_instances (
  id uuid primary key default gen_random_uuid(),
  ancestor_id uuid references ancestors(id) on delete cascade, -- null for per_family_group scope
  family_group_id uuid not null references family_groups(id) on delete cascade,
  type_code text not null references observance_types(code),
  lunar_month smallint check (lunar_month between 1 and 12),
  lunar_day smallint check (lunar_day between 1 and 30),
  is_leap_month boolean not null default false,
  day_offset int, -- for day-offset types (頭七..尾七, 百日)
  next_occurrence_solar date,
  lead_days int[] not null default '{30,14,7,3,1,0}',
  no_delay_convention boolean not null default false,
  completed_at timestamptz, -- set once a ONCE-type instance has fired, so it never fires again
  created_at timestamptz not null default now()
);

comment on table observance_instances is 'One row per (ancestor, occasion) for person-specific types, or one row per (family_group, occasion) for family-wide types — never one per ancestor for family-wide types. This is what prevents duplicate CNY/Zhongyuan/Qingming/Winter-Solstice notifications when a family has multiple ancestors.';

-- Enforce the per_ancestor / per_family_group scope rule at the DB level
create or replace function enforce_observance_instance_scope()
returns trigger as $$
declare
  v_scope observance_scope;
begin
  select scope into v_scope from observance_types where code = new.type_code;
  if v_scope is null then
    raise exception 'unknown observance type_code %', new.type_code;
  end if;
  if v_scope = 'per_family_group' and new.ancestor_id is not null then
    raise exception 'observance type % is per_family_group scoped and must not set ancestor_id (this is what prevents duplicate family-wide reminders)', new.type_code;
  end if;
  if v_scope = 'per_ancestor' and new.ancestor_id is null then
    raise exception 'observance type % is per_ancestor scoped and requires ancestor_id', new.type_code;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_instance_scope
before insert or update on observance_instances
for each row execute function enforce_observance_instance_scope();

-- One family-wide instance per (family_group, type); one per-ancestor instance
-- per (ancestor, type, day_offset) — day_offset distinguishes 頭七/二七/.../尾七.
create unique index uq_family_wide_instance
  on observance_instances (family_group_id, type_code)
  where ancestor_id is null;

create unique index uq_ancestor_instance
  on observance_instances (ancestor_id, type_code, coalesce(day_offset, -1))
  where ancestor_id is not null;

create index idx_observance_instances_next_occurrence on observance_instances (next_occurrence_solar);

-- ---------------------------------------------------------------------------
-- Ritual instructions
-- ---------------------------------------------------------------------------

create table ritual_templates (
  id uuid primary key default gen_random_uuid(),
  type_code text not null unique references observance_types(code),
  location text, -- altar / grave / temple
  offerings_json jsonb not null default '{}',
  sequence_json jsonb not null default '[]',
  invocation_template text,
  notes text,
  taboos text,
  translations jsonb not null default '{}', -- {"en": {...}, "zh": {...}}
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Facility / niche renewal fee reminders
-- ---------------------------------------------------------------------------

create table facility_renewals (
  id uuid primary key default gen_random_uuid(),
  ancestor_id uuid not null references ancestors(id) on delete cascade,
  facility_name text not null,
  provider_contact text,
  renewal_basis text not null check (renewal_basis in ('solar', 'lunar')),
  renewal_month smallint not null check (renewal_month between 1 and 12),
  renewal_day smallint not null check (renewal_day between 1 and 31),
  lead_days int[] not null default '{30,14,7,3,1,0}',
  fee_amount numeric(10, 2),
  payment_notes text,
  next_renewal_solar date,
  created_at timestamptz not null default now()
);

create index idx_facility_renewals_next on facility_renewals (next_renewal_solar);

-- ---------------------------------------------------------------------------
-- Notifications (delivery log + idempotency)
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references observance_instances(id) on delete cascade,
  renewal_id uuid references facility_renewals(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  lead_day int not null,
  occurrence_year int not null,
  channel contact_channel not null,
  status notification_status not null default 'pending',
  message_body text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (instance_id is not null and renewal_id is null) or
    (instance_id is null and renewal_id is not null)
  )
);

-- Idempotency: one notification per (occasion-or-renewal, recipient, lead day, year).
-- The daily job uses `insert ... on conflict do nothing` against this index,
-- so re-running the job never double-sends.
create unique index uq_notification_idempotency
  on notifications (coalesce(instance_id, renewal_id), person_id, lead_day, occurrence_year);

-- ---------------------------------------------------------------------------
-- Row level security — single-admin model
-- ---------------------------------------------------------------------------
-- Only an authenticated user may read/write. Disable public sign-ups in the
-- Supabase Auth dashboard so your account is the only one that can exist.

alter table people enable row level security;
alter table family_groups enable row level security;
alter table family_group_members enable row level security;
alter table ancestors enable row level security;
alter table observance_types enable row level security;
alter table observance_instances enable row level security;
alter table ritual_templates enable row level security;
alter table facility_renewals enable row level security;
alter table notifications enable row level security;

create policy "admin full access" on people for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on family_groups for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on family_group_members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on ancestors for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on observance_types for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on observance_instances for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on ritual_templates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on facility_renewals for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin full access" on notifications for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- The daily Edge Function uses the service role key, which bypasses RLS
-- entirely, so it does not need its own policy.
