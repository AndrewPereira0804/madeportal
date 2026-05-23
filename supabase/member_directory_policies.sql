-- Allows active authenticated users to read active member directory profiles
-- and the role assignments for those active profiles.
-- Verify hosted policy/function state before applying because hosted Supabase is canonical.

create or replace function public.is_active(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = check_user_id
      and status = 'active'
  );
$$;

revoke all on function public.is_active(uuid) from anon, authenticated;
grant execute on function public.is_active(uuid) to authenticated;

create or replace function public.can_read_active_directory_role(check_user_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.profiles
      where user_id = check_user_id
        and status = 'active'
    )
    and exists (
      select 1
      from public.profiles
      where user_id = target_user_id
        and status = 'active'
    );
$$;

revoke all on function public.can_read_active_directory_role(uuid, uuid) from anon, authenticated;
grant execute on function public.can_read_active_directory_role(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Active users can read active profiles" on public.profiles;
drop policy if exists "Active users can read active user roles" on public.user_roles;

create policy "Active users can read active profiles"
on public.profiles
for select
to authenticated
using (
  status = 'active'
  and public.is_active(auth.uid())
);

create policy "Active users can read active user roles"
on public.user_roles
for select
to authenticated
using (public.can_read_active_directory_role(auth.uid(), user_id));
