-- Hardens role assignment so profile editing cannot grant roles above the actor.
-- Admins can manage every role. Presidents can manage VP/Recorder/lower roles.
-- VPs can manage Recorder/lower roles. Recorders can manage lower roles only.

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from public;
revoke all on table public.user_roles from anon;
revoke all on table public.user_roles from authenticated;

grant select on table public.user_roles to authenticated;
grant insert (user_id, role_slug) on public.user_roles to authenticated;
grant delete on table public.user_roles to authenticated;

create or replace function public.current_user_can_manage_role_assignment(target_role_slug text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with actor_roles as (
    select ur.role_slug
    from public.user_roles ur
    join public.profiles p
      on p.user_id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  select coalesce((
    select
      nullif(btrim(target_role_slug), '') is not null
      and (
        exists (
          select 1
          from actor_roles
          where role_slug = 'admin'
        )
        or (
          lower(btrim(target_role_slug)) not in ('admin', 'president', 'ea')
          and exists (
            select 1
            from actor_roles
            where role_slug in ('president', 'ea')
          )
        )
        or (
          lower(btrim(target_role_slug)) not in (
            'admin',
            'president',
            'ea',
            'vice-president',
            'vice_president',
            'vp',
            'eda'
          )
          and exists (
            select 1
            from actor_roles
            where role_slug in ('vice-president', 'vice_president', 'vp', 'eda')
          )
        )
        or (
          lower(btrim(target_role_slug)) not in (
            'admin',
            'president',
            'ea',
            'vice-president',
            'vice_president',
            'vp',
            'eda',
            'rec',
            'recorder'
          )
          and exists (
            select 1
            from actor_roles
            where role_slug in ('rec', 'recorder')
          )
        )
      )
  ), false);
$$;

create or replace function public.current_user_can_read_role_assignments()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_can_manage_role_assignment('brother');
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

revoke all on function public.current_user_can_manage_role_assignment(text) from public;
revoke all on function public.current_user_can_manage_role_assignment(text) from anon;
grant execute on function public.current_user_can_manage_role_assignment(text) to authenticated;

revoke all on function public.current_user_can_read_role_assignments() from public;
revoke all on function public.current_user_can_read_role_assignments() from anon;
grant execute on function public.current_user_can_read_role_assignments() to authenticated;

revoke all on function public.current_user_can_insert_role_assignment(text, uuid) from public;
revoke all on function public.current_user_can_insert_role_assignment(text, uuid) from anon;
grant execute on function public.current_user_can_insert_role_assignment(text, uuid) to authenticated;

drop policy if exists "Active users can read active user roles" on public.user_roles;
drop policy if exists "Member managers can delete user roles" on public.user_roles;
drop policy if exists "Member managers can insert user roles" on public.user_roles;
drop policy if exists "Member managers can read all user roles" on public.user_roles;
drop policy if exists "Role assignment managers can delete allowed user roles" on public.user_roles;
drop policy if exists "Role assignment managers can insert allowed user roles" on public.user_roles;
drop policy if exists "Role assignment managers can read all user roles" on public.user_roles;
drop policy if exists "Users can read own roles" on public.user_roles;
drop policy if exists "read own roles" on public.user_roles;

create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_active((select auth.uid()))
);

create policy "Active users can read active user roles"
on public.user_roles
for select
to authenticated
using (
  public.is_active((select auth.uid()))
  and public.is_active(user_id)
);

create policy "Role assignment managers can read all user roles"
on public.user_roles
for select
to authenticated
using (public.current_user_can_read_role_assignments());

create policy "Role assignment managers can insert allowed user roles"
on public.user_roles
for insert
to authenticated
with check (public.current_user_can_insert_role_assignment(role_slug, user_id));

create policy "Role assignment managers can delete allowed user roles"
on public.user_roles
for delete
to authenticated
using (public.current_user_can_manage_role_assignment(role_slug));

drop policy if exists "Role assignment managers can read all profiles" on public.profiles;

create policy "Role assignment managers can read all profiles"
on public.profiles
for select
to authenticated
using (public.current_user_can_read_role_assignments());

notify pgrst, 'reload schema';
