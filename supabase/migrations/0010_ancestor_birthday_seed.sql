-- Second half of the 冥誕 (posthumous birthday) feature -- run this only
-- after 0009_ancestor_birthday.sql has been run and completed on its own.
-- (Split into two files/two runs because Postgres won't let a
-- brand-new enum value be used in the same transaction that added it.)
--
-- NOTE: this was already run live in the Supabase SQL Editor when the
-- feature was built, so you do NOT need to run it again against your
-- current project. This file exists only so the change is recorded in
-- your repo, in case you ever set up a fresh Supabase project from
-- scratch.

insert into observance_types (code, calendar_basis, recurrence, scope, default_label, default_lead_days) values
  ('MING_DAN', 'solar', 'yearly', 'per_ancestor', '冥誕 (birthday remembrance)', '{7,3,1,0}');