-- Adjust profiles.user_id below if your table uses a different key column.

create or replace function public.is_admin(check_user_id uuid)
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

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.roles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

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

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin(auth.uid()));

create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can read own roles" on public.user_roles;
drop policy if exists "Admins can read all user roles" on public.user_roles;
drop policy if exists "Admins can insert user roles" on public.user_roles;
drop policy if exists "Admins can delete user roles" on public.user_roles;

create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can read all user roles"
on public.user_roles
for select
to authenticated
using (public.is_admin(auth.uid()));

create policy "Admins can insert user roles"
on public.user_roles
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "Admins can delete user roles"
on public.user_roles
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Authenticated users can read roles" on public.roles;

create policy "Authenticated users can read roles"
on public.roles
for select
to authenticated
using (true);
