-- Legacy/stale rollout helper. Hosted profile and user-role RLS is now
-- maintained by supabase/profiles_policies.sql and supabase/user_roles_policies.sql.
-- Do not run this file against hosted Supabase without rebuilding those policies.

-- =========================
-- 0) Drop dependent objects + old helper funcs
-- =========================
-- Drops is_admin + anything that depends on it (including RLS policies)
drop function if exists public.is_admin(uuid) cascade;

-- Drops can_manage_members + anything that depends on it
drop function if exists public.can_manage_members(uuid) cascade;


-- =========================
-- 1) Helper functions
-- =========================
create function public.is_admin(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

create function public.can_manage_members(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug in ('admin', 'ea', 'eda')
  );
$$;

revoke all on function public.can_manage_members(uuid) from anon, authenticated;
grant execute on function public.can_manage_members(uuid) to authenticated;


-- =========================
-- 2) Enable RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.roles enable row level security;


-- =========================
-- 3) Profiles policies
-- =========================
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Member managers can read all profiles" on public.profiles;
drop policy if exists "Member managers can update all profiles" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Member managers can read all profiles"
on public.profiles
for select
to authenticated
using (public.can_manage_members(auth.uid()));

create policy "Member managers can update all profiles"
on public.profiles
for update
to authenticated
using (public.can_manage_members(auth.uid()))
with check (public.can_manage_members(auth.uid()));


-- =========================
-- 4) User_roles policies
-- =========================
drop policy if exists "Users can read own roles" on public.user_roles;
drop policy if exists "Member managers can read all user roles" on public.user_roles;
drop policy if exists "Member managers can insert user roles" on public.user_roles;
drop policy if exists "Member managers can delete user roles" on public.user_roles;

create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy "Member managers can read all user roles"
on public.user_roles
for select
to authenticated
using (public.can_manage_members(auth.uid()));

create policy "Member managers can insert user roles"
on public.user_roles
for insert
to authenticated
with check (public.can_manage_members(auth.uid()));

create policy "Member managers can delete user roles"
on public.user_roles
for delete
to authenticated
using (public.can_manage_members(auth.uid()));


-- =========================
-- 5) Roles policies
-- =========================
drop policy if exists "Authenticated users can read roles" on public.roles;

create policy "Authenticated users can read roles"
on public.roles
for select
to authenticated
using (true);
