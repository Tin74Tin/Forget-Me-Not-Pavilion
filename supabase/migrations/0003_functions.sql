-- Idempotent notification claiming.
--
-- The daily reminder job calls this once per (occasion-or-renewal, person,
-- lead_day, year) it wants to send. It inserts a 'pending' row and returns
-- its id — or returns NULL if that exact reminder was already claimed by an
-- earlier run, so a retried/re-run job never sends a duplicate message.

create or replace function claim_notification(
  p_instance_id uuid,
  p_renewal_id uuid,
  p_person_id uuid,
  p_lead_day int,
  p_occurrence_year int,
  p_channel contact_channel
) returns uuid as $$
declare
  v_id uuid;
begin
  insert into notifications (instance_id, renewal_id, person_id, lead_day, occurrence_year, channel, status)
  values (p_instance_id, p_renewal_id, p_person_id, p_lead_day, p_occurrence_year, p_channel, 'pending')
  on conflict (coalesce(instance_id, renewal_id), person_id, lead_day, occurrence_year) do nothing
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql;
