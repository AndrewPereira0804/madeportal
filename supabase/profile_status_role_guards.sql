-- Makes profiles.status the authority for role-based permissions.
-- Pending and suspended profiles cannot use roles, cannot receive new roles,
-- and lose all role assignments when status changes away from active.

create or replace function public.current_user_is_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  );
$$;

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$$;

create or replace function public.can_manage_members(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp'
        )
    );
$$;

create or replace function public.can_manage_wait_ons(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'stew',
          'steward'
        )
    );
$$;

create or replace function public.can_read_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug in (
          'admin',
          'ea',
          'eda',
          'hsm',
          'health-safety-manager'
        )
    );
$$;

create or replace function public.can_manage_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$$;

create or replace function public.user_has_role(check_role_slug text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = check_role_slug
    );
$$;

create or replace function public.user_has_any_role(check_role_slugs text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = any(check_role_slugs)
    );
$$;

create or replace function public.is_role_member(p_role_slug text, p_user_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select p_user_id is not null
    and public.is_active(p_user_id)
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.role_slug = p_role_slug
    );
$$;

create or replace function public.current_user_can_insert_role_assignment(
  target_role_slug text,
  target_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_active(target_user_id)
    and public.current_user_can_manage_role_assignment(target_role_slug);
$$;

revoke all on function public.current_user_is_active() from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.can_manage_members(uuid) from public;
revoke all on function public.can_manage_wait_ons(uuid) from public;
revoke all on function public.can_read_all_emergency_contacts(uuid) from public;
revoke all on function public.can_manage_all_emergency_contacts(uuid) from public;
revoke all on function public.user_has_role(text) from public;
revoke all on function public.user_has_any_role(text[]) from public;
revoke all on function public.is_role_member(text, uuid) from public;
revoke all on function public.current_user_can_insert_role_assignment(text, uuid) from public;

revoke all on function public.current_user_is_active() from anon;
revoke all on function public.is_admin(uuid) from anon;
revoke all on function public.can_manage_members(uuid) from anon;
revoke all on function public.can_manage_wait_ons(uuid) from anon;
revoke all on function public.can_read_all_emergency_contacts(uuid) from anon;
revoke all on function public.can_manage_all_emergency_contacts(uuid) from anon;
revoke all on function public.user_has_role(text) from anon;
revoke all on function public.user_has_any_role(text[]) from anon;
revoke all on function public.is_role_member(text, uuid) from anon;
revoke all on function public.current_user_can_insert_role_assignment(text, uuid) from anon;

grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_manage_members(uuid) to authenticated;
grant execute on function public.can_manage_wait_ons(uuid) to authenticated;
grant execute on function public.can_read_all_emergency_contacts(uuid) to authenticated;
grant execute on function public.can_manage_all_emergency_contacts(uuid) to authenticated;
grant execute on function public.user_has_role(text) to authenticated;
grant execute on function public.user_has_any_role(text[]) to authenticated;
grant execute on function public.is_role_member(text, uuid) to authenticated;
grant execute on function public.current_user_can_insert_role_assignment(text, uuid) to authenticated;

drop policy if exists "Role assignment managers can insert allowed user roles" on public.user_roles;

create policy "Role assignment managers can insert allowed user roles"
on public.user_roles
for insert
to authenticated
with check (public.current_user_can_insert_role_assignment(role_slug, user_id));

drop policy if exists "Users can read own roles" on public.user_roles;

create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_active((select auth.uid()))
);

create or replace function public.remove_roles_for_inactive_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending'::public.user_status, 'suspended'::public.user_status) then
    delete from public.user_roles
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.remove_roles_for_inactive_profile() from public;
revoke all on function public.remove_roles_for_inactive_profile() from anon;
revoke all on function public.remove_roles_for_inactive_profile() from authenticated;

drop trigger if exists remove_roles_for_inactive_profile on public.profiles;

create trigger remove_roles_for_inactive_profile
after update of status on public.profiles
for each row
when (
  new.status is distinct from old.status
  and new.status in ('pending'::public.user_status, 'suspended'::public.user_status)
)
execute function public.remove_roles_for_inactive_profile();

delete from public.user_roles ur
using public.profiles p
where p.user_id = ur.user_id
  and p.status in ('pending'::public.user_status, 'suspended'::public.user_status);

notify pgrst, 'reload schema';
