-- Require every newly-active profile to have an app-access role.
-- Existing active profiles are not backfilled or scanned by this migration.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.profile_has_app_access_role(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select check_user_id is not null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = check_user_id
        and ur.role_slug in ('admin', 'brother', 'neophyte', 'alum', 'alumni')
    );
$$;

revoke all on function private.profile_has_app_access_role(uuid) from public, anon, authenticated;
grant execute on function private.profile_has_app_access_role(uuid) to authenticated;

create or replace function private.enforce_active_profile_app_access_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'::public.user_status
    and not private.profile_has_app_access_role(new.user_id)
  then
    raise exception 'Active profiles must have an app access role'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_active_user_roles_app_access_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_user_id uuid := null;
  new_user_id uuid := null;
  affected_user_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_user_id := old.user_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_user_id := new.user_id;
  end if;

  for affected_user_id in
    select distinct user_id
    from unnest(array[old_user_id, new_user_id]) as affected(user_id)
    where user_id is not null
  loop
    if exists (
      select 1
      from public.profiles p
      where p.user_id = affected_user_id
        and p.status = 'active'::public.user_status
    )
      and not private.profile_has_app_access_role(affected_user_id)
    then
      raise exception 'Active profiles must have an app access role'
        using errcode = '23514';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_active_profile_app_access_role() from public, anon, authenticated;
revoke all on function private.enforce_active_user_roles_app_access_role() from public, anon, authenticated;

drop trigger if exists enforce_active_profile_app_access_role on public.profiles;

create constraint trigger enforce_active_profile_app_access_role
after insert or update of status on public.profiles
deferrable initially deferred
for each row
execute function private.enforce_active_profile_app_access_role();

drop trigger if exists enforce_active_user_roles_app_access_role on public.user_roles;

create constraint trigger enforce_active_user_roles_app_access_role
after insert or update or delete on public.user_roles
deferrable initially deferred
for each row
execute function private.enforce_active_user_roles_app_access_role();

create or replace function public.approve_member(
  target_user_id uuid,
  chapter_role_slug text,
  extra_role_slugs text[] default '{}'::text[]
)
returns table (
  approved_user_id uuid,
  account_status public.user_status,
  role_slugs text[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_chapter_role_slug text;
  normalized_extra_role_slugs text[];
  updated_count integer;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required'
      using errcode = '22023';
  end if;

  normalized_chapter_role_slug := lower(btrim(coalesce(chapter_role_slug, '')));

  if normalized_chapter_role_slug = 'alumni' then
    normalized_chapter_role_slug := 'alum';
  end if;

  if normalized_chapter_role_slug not in ('brother', 'neophyte', 'alum') then
    raise exception 'chapter_role_slug must be brother, neophyte, or alum'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct normalized_role_slug order by normalized_role_slug), '{}'::text[])
  into normalized_extra_role_slugs
  from (
    select case
        when normalized_role_slug = 'alumni' then 'alum'
        else normalized_role_slug
      end as normalized_role_slug
    from (
      select lower(btrim(role_slug)) as normalized_role_slug
      from unnest(coalesce(extra_role_slugs, '{}'::text[])) as role_slug
    ) normalized_input
    where normalized_role_slug <> ''
      and normalized_role_slug not in ('brother', 'neophyte', 'alum', 'alumni')
  ) normalized_extra_input;

  update public.profiles as p
  set status = 'active'::public.user_status
  where p.user_id = target_user_id;

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'Profile was not found or you cannot approve it'
      using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role_slug)
  select target_user_id, role_slug
  from (
    select normalized_chapter_role_slug as role_slug
    union
    select unnest(normalized_extra_role_slugs) as role_slug
  ) roles_to_assign
  on conflict (user_id, role_slug) do nothing;

  if not private.profile_has_app_access_role(target_user_id) then
    raise exception 'Chapter access role could not be assigned'
      using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    p.status,
    coalesce(
      array_agg(ur.role_slug order by ur.role_slug) filter (where ur.role_slug is not null),
      '{}'::text[]
    )
  from public.profiles p
  left join public.user_roles ur
    on ur.user_id = p.user_id
  where p.user_id = target_user_id
  group by p.user_id, p.status;
end;
$$;

revoke all on function public.approve_member(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.approve_member(uuid, text, text[]) to authenticated;

notify pgrst, 'reload schema';
