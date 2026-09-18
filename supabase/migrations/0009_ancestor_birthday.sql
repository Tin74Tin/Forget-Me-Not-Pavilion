-- Optional posthumous-birthday reminder (冥誕). `ancestors.dob_solar` has
-- existed since 0001 but was never wired up to any form or reminder --
-- this adds the observance type that uses it.
--
-- Deliberately Gregorian, not lunar: unlike every other yearly observance
-- in this app, Tin wants this one to recur on the ancestor's fixed
-- Gregorian birth month/day each year, the same way an ordinary birthday
-- would, rather than shifting with the lunar calendar the way 忌日 does.
--
-- NOTE: this was already run live in the Supabase SQL Editor when the
-- feature was built, so you do NOT need to run it again against your
-- current project. This file exists only so the change is recorded in
-- your repo, in case you ever set up a fresh Supabase project from
-- scratch.

alter type calendar_basis add value if not exists 'solar';