-- Lets a super_admin resolve an already-invited user's email to their
-- auth.users id, so the admin-management screen can register a new admin
-- (super_admin or data_entry -- there's no cap on how many of either) by
-- email instead of a manual UUID copy-paste out of the Supabase Dashboard.
--
-- This function only LOOKS UP an existing auth.users row -- it never
-- creates one. The account itself still has to exist first, via
-- Authentication -> Invite user in the Supabase Dashboard (public sign-up
-- is disabled for this app -- see README), which sends the person a magic
-- link and creates their auth.users row. Once they exist there, a
-- super_admin can look them up here and add the corresponding admin_users
-- row with whichever role.

create or replace function admin_lookup_user_id(p_email text)
returns uuid as $$
declare
  v_id uuid;
begin
  if not is_super_admin() then
    raise exception 'only a super_admin can look up users to invite';
  end if;

  select id into v_id from auth.users where lower(email) = lower(p_email);
  return v_id; -- null means: not found -- invite them in the Dashboard first
end;
$$ language plpgsql stable security definer set search_path = public;

comment on function admin_lookup_user_id is 'security definer: needs to read auth.users, which normal roles cannot query directly; access is restricted to super_admin via the internal is_super_admin() check, not by the grant below.';

revoke all on function admin_lookup_user_id(text) from public;
grant execute on function admin_lookup_user_id(text) to authenticated;
