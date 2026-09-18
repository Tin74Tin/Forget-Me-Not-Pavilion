-- Codifies the daily reminder job's cron schedule, which was originally set
-- up live via the Supabase SQL Editor (job id 1) before this file existed.
-- This file exists for reproducibility only -- it does NOT need to be
-- re-run on your current project, since the schedule already exists there.
--
-- IMPORTANT: if you ever run this against a fresh Supabase project, replace
-- <SERVICE_ROLE_KEY> below with that project's actual service_role key
-- (Supabase Dashboard -> Project Settings -> API) before running it --
-- and never commit that real key to GitHub, since this repo is public.
-- Keep the placeholder in any version you commit.

select cron.schedule(
  'daily-reminders',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://bvwungzpiupoqhbakqtp.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json')
  );
  $$
);