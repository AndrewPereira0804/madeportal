-- Hardens profile access so frontend route guards are not the security boundary.
-- Ordinary users may create/read their own pending profile and edit basic profile
-- details, but they cannot change profile identity or approval status.

alter table public.profiles enable row level security;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;
grant insert (
  user_id,
  name,
  email,
  status,
  phone,
  grad_year,
  major,
  hometown
) on public.profiles to authenticated;
grant update (
  name,
  status,
  phone,
  grad_year,
  major,
  hometown
) on public.profiles to authenticated;

drop policy if exists "Active users can read active profiles" on public.profiles;
drop policy if exists "Member managers can read all profiles" on public.profiles;
drop policy if exists "Member managers can update all profiles" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "profiles_insert_authenticated" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "update_own_profile_while_pending" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Active users can read active profiles"
on public.profiles
for select
to authenticated
using (
  status = 'active'::public.user_status
  and public.is_active((select auth.uid()))
);

create policy "Member managers can read all profiles"
on public.profiles
for select
to authenticated
using (
  public.is_active((select auth.uid()))
  and public.can_manage_members((select auth.uid()))
);

create policy "Users can insert own pending profile"
on public.profiles
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'::public.user_status
);

create policy "Users can update own profile details"
on public.profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Member managers can update profiles"
on public.profiles
for update
to authenticated
using (
  public.is_active((select auth.uid()))
  and public.can_manage_members((select auth.uid()))
)
with check (
  public.is_active((select auth.uid()))
  and public.can_manage_members((select auth.uid()))
);

create or replace function public.prevent_profile_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_user_id uuid := (select auth.uid());
  request_can_manage_members boolean := false;
begin
  if request_user_id is null then
    return new;
  end if;

  request_can_manage_members :=
    public.is_active(request_user_id)
    and public.can_manage_members(request_user_id);

  if not request_can_manage_members then
    if new.user_id is distinct from old.user_id then
      raise exception 'profiles.user_id cannot be changed by this user'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      raise exception 'profiles.status cannot be changed by this user'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_self_privilege_escalation() from public;
revoke all on function public.prevent_profile_self_privilege_escalation() from anon;
revoke all on function public.prevent_profile_self_privilege_escalation() from authenticated;

drop trigger if exists prevent_profile_self_privilege_escalation on public.profiles;
create trigger prevent_profile_self_privilege_escalation
before update on public.profiles
for each row
execute function public.prevent_profile_self_privilege_escalation();

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.can_manage_members(uuid) from public;
revoke all on function public.is_active(uuid) from public;
revoke all on function public.is_admin(uuid) from anon;
revoke all on function public.can_manage_members(uuid) from anon;
revoke all on function public.is_active(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_manage_members(uuid) to authenticated;
grant execute on function public.is_active(uuid) to authenticated;

notify pgrst, 'reload schema';
