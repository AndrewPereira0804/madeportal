-- The approval RPC needs to perform the status change and first role insert as
-- one operation. A suspended target cannot receive a client-RLS role insert in
-- the same transaction that activates it, so the RPC owns the write after
-- explicitly checking the caller's existing member/role-management authority.

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
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
  normalized_chapter_role_slug text;
  normalized_extra_role_slugs text[];
  updated_count integer;
begin
  perform set_config('row_security', 'off', true);

  if request_user_id is null or not private.can_manage_members(request_user_id) then
    raise exception 'You cannot approve members'
      using errcode = '42501';
  end if;

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

  if not private.current_user_can_manage_role_assignment(normalized_chapter_role_slug) then
    raise exception 'You cannot assign the requested chapter role'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct normalized_role_slug order by normalized_role_slug), '{}'::text[])
  into normalized_extra_role_slugs
  from (
    select case
        when normalized_role_slug = 'alumni' then 'alum'
        else normalized_role_slug
      end as normalized_role_slug
    from (
      select lower(btrim(input_role_slug.role_slug)) as normalized_role_slug
      from unnest(coalesce(extra_role_slugs, '{}'::text[])) as input_role_slug(role_slug)
    ) normalized_input
    where normalized_role_slug <> ''
      and normalized_role_slug not in ('brother', 'neophyte', 'alum', 'alumni')
  ) normalized_extra_input;

  if exists (
    select 1
    from unnest(normalized_extra_role_slugs) as extra_role(role_slug)
    where not private.current_user_can_manage_role_assignment(extra_role.role_slug)
  ) then
    raise exception 'You cannot assign one or more requested extra roles'
      using errcode = '42501';
  end if;

  update public.profiles as p
  set status = 'active'::public.user_status
  where p.user_id = target_user_id;

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'Profile was not found'
      using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role_slug)
  select target_user_id, role_slug
  from (
    select normalized_chapter_role_slug as role_slug
    union
    select unnest(normalized_extra_role_slugs) as role_slug
  ) roles_to_assign
  on conflict (user_id, role_slug) do nothing;

  delete from public.user_roles
  where user_id = target_user_id
    and role_slug in ('brother', 'neophyte', 'alum', 'alumni')
    and role_slug <> normalized_chapter_role_slug;

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
