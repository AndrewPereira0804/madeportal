alter table public.events enable row level security;

alter table public.events
  alter column created_by drop default,
  alter column created_by set not null,
  alter column "end" set not null;

alter table public.events
  drop constraint if exists events_title_not_blank_check,
  drop constraint if exists events_end_after_start_check,
  drop constraint if exists events_alumni_event_visible_check,
  drop constraint if exists events_event_tags_allowed_check,
  drop constraint if exists events_event_tags_include_primary_check,
  drop constraint if exists events_alumni_event_tag_visible_check;

alter table public.events
  add constraint events_title_not_blank_check
  check (btrim(title) <> ''),
  add constraint events_end_after_start_check
  check ("end" > "start"),
  add constraint events_alumni_event_visible_check
  check (event_type <> 'alumni_event' or visible_to_alum is true),
  add constraint events_event_tags_allowed_check
  check (
    array_position(event_tags, null) is null
    and event_tags <@ array[
      'party',
      'formal',
      'sorority_fraternity',
      'dei',
      'community_service',
      'philanthropy',
      'house_meeting',
      'alumni_event',
      'rush',
      'scholarship',
      'professional_development',
      'brotherhood_event',
      'hsm_event',
      'work_party',
      'new_member_meeting',
      'new_member_event',
      'other'
    ]::text[]
  ),
  add constraint events_event_tags_include_primary_check
  check (event_type = any(event_tags)),
  add constraint events_alumni_event_tag_visible_check
  check (not ('alumni_event' = any(event_tags)) or visible_to_alum is true);

revoke all on public.events from anon;
revoke all on public.events from public;
revoke all on public.events from authenticated;

grant select on public.events to authenticated;
grant insert (
  title,
  description,
  "start",
  "end",
  created_by,
  visible_to_alum,
  visible_to_neophyte,
  event_type,
  event_tags,
  details
) on public.events to authenticated;
grant update (
  title,
  description,
  "start",
  "end",
  visible_to_alum,
  visible_to_neophyte,
  event_type,
  event_tags,
  details
) on public.events to authenticated;
grant delete on public.events to authenticated;

do $$
begin
  if to_regprocedure('public.can_manage_all_events(uuid)') is not null then
    execute 'revoke all on function public.can_manage_all_events(uuid) from public';
    execute 'revoke all on function public.can_manage_all_events(uuid) from anon';
    execute 'revoke all on function public.can_manage_all_events(uuid) from authenticated';
  end if;

  if to_regprocedure('public.can_manage_event_type(uuid, text)') is not null then
    execute 'revoke all on function public.can_manage_event_type(uuid, text) from public';
    execute 'revoke all on function public.can_manage_event_type(uuid, text) from anon';
    execute 'revoke all on function public.can_manage_event_type(uuid, text) from authenticated';
  end if;

  if to_regprocedure('public.can_manage_events(uuid)') is not null then
    execute 'revoke all on function public.can_manage_events(uuid) from public';
    execute 'revoke all on function public.can_manage_events(uuid) from anon';
    execute 'revoke all on function public.can_manage_events(uuid) from authenticated';
  end if;
end $$;

drop policy if exists "Social chair can read party events" on public.events;
drop policy if exists "Social chair can create party events" on public.events;
drop policy if exists "Social chair can update party events" on public.events;
drop policy if exists "Event managers can read all events" on public.events;
drop policy if exists "Event managers can insert events" on public.events;
drop policy if exists "Event managers can update all events" on public.events;
drop policy if exists "Event managers can delete all events" on public.events;
drop policy if exists "Event type managers can read manageable events" on public.events;
drop policy if exists "Event type managers can create manageable events" on public.events;
drop policy if exists "Event type managers can update manageable events" on public.events;
drop policy if exists "Event type managers can delete manageable events" on public.events;
drop policy if exists "events_select_visible" on public.events;
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_allowed" on public.events;
drop policy if exists "events_delete_allowed" on public.events;
drop policy if exists "Active users can read permitted events" on public.events;
drop policy if exists "Approved event roles can insert events" on public.events;
drop policy if exists "Event managers can update allowed events" on public.events;
drop policy if exists "Event managers can delete allowed events" on public.events;

create policy "Active users can read permitted events"
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and (
          ur.role_slug in (
            'admin',
            'ea',
            'eda',
            'president',
            'vice-president',
            'vice_president',
            'vp',
            'rec',
            'recorder',
            'brother'
          )
          or (event_type in ('party', 'formal') and ur.role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
          or (event_type = 'sorority_fraternity' and ur.role_slug = 'social-events')
          or (event_type = 'dei' and ur.role_slug = 'dei-chair')
          or (event_type = 'alumni_event' and ur.role_slug = 'alumni-chair')
          or (event_type = 'brotherhood_event' and ur.role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
          or (event_type = 'community_service' and ur.role_slug in ('cs-chair', 'community-service-chair'))
          or (event_type = 'hsm_event' and ur.role_slug in ('hsm', 'health-safety-manager'))
          or (event_type in ('new_member_meeting', 'new_member_event') and ur.role_slug in ('membered', 'member-educator'))
          or (event_type = 'philanthropy' and ur.role_slug in ('philo-chair', 'philanthropy-chair'))
          or (event_type = 'professional_development' and ur.role_slug = 'prof-dev')
          or (event_type = 'rush' and ur.role_slug = 'rush-chair')
          or (event_type = 'scholarship' and ur.role_slug = 'scholarship')
          or (event_type in ('house_meeting', 'work_party') and ur.role_slug in ('hm', 'house-manager'))
        )
    )
    or (
      visible_to_neophyte is true
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role_slug = 'neophyte'
      )
    )
    or (
      (visible_to_alum is true or event_type = 'alumni_event')
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role_slug in ('alum', 'alumni')
      )
    )
  )
);

create policy "Approved event roles can insert events"
on public.events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and btrim(title) <> ''
  and "end" > "start"
  and jsonb_typeof(details) = 'object'
  and (event_type <> 'alumni_event' or visible_to_alum is true)
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'rec',
          'recorder'
        )
        or (event_type in ('party', 'formal') and ur.role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'sorority_fraternity' and ur.role_slug = 'social-events')
        or (event_type = 'dei' and ur.role_slug = 'dei-chair')
        or (event_type = 'alumni_event' and ur.role_slug = 'alumni-chair')
        or (event_type = 'brotherhood_event' and ur.role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'community_service' and ur.role_slug in ('cs-chair', 'community-service-chair'))
        or (event_type = 'hsm_event' and ur.role_slug in ('hsm', 'health-safety-manager'))
        or (event_type in ('new_member_meeting', 'new_member_event') and ur.role_slug in ('membered', 'member-educator'))
        or (event_type = 'philanthropy' and ur.role_slug in ('philo-chair', 'philanthropy-chair'))
        or (event_type = 'professional_development' and ur.role_slug = 'prof-dev')
        or (event_type = 'rush' and ur.role_slug = 'rush-chair')
        or (event_type = 'scholarship' and ur.role_slug = 'scholarship')
        or (event_type in ('house_meeting', 'work_party') and ur.role_slug in ('hm', 'house-manager'))
      )
  )
);

create policy "Event managers can update allowed events"
on public.events
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'rec',
          'recorder'
        )
        or (event_type in ('party', 'formal') and ur.role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'sorority_fraternity' and ur.role_slug = 'social-events')
        or (event_type = 'dei' and ur.role_slug = 'dei-chair')
        or (event_type = 'alumni_event' and ur.role_slug = 'alumni-chair')
        or (event_type = 'brotherhood_event' and ur.role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'community_service' and ur.role_slug in ('cs-chair', 'community-service-chair'))
        or (event_type = 'hsm_event' and ur.role_slug in ('hsm', 'health-safety-manager'))
        or (event_type in ('new_member_meeting', 'new_member_event') and ur.role_slug in ('membered', 'member-educator'))
        or (event_type = 'philanthropy' and ur.role_slug in ('philo-chair', 'philanthropy-chair'))
        or (event_type = 'professional_development' and ur.role_slug = 'prof-dev')
        or (event_type = 'rush' and ur.role_slug = 'rush-chair')
        or (event_type = 'scholarship' and ur.role_slug = 'scholarship')
        or (event_type in ('house_meeting', 'work_party') and ur.role_slug in ('hm', 'house-manager'))
      )
  )
)
with check (
  created_by is not null
  and btrim(title) <> ''
  and "end" > "start"
  and jsonb_typeof(details) = 'object'
  and (event_type <> 'alumni_event' or visible_to_alum is true)
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'rec',
          'recorder'
        )
        or (event_type in ('party', 'formal') and ur.role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'sorority_fraternity' and ur.role_slug = 'social-events')
        or (event_type = 'dei' and ur.role_slug = 'dei-chair')
        or (event_type = 'alumni_event' and ur.role_slug = 'alumni-chair')
        or (event_type = 'brotherhood_event' and ur.role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'community_service' and ur.role_slug in ('cs-chair', 'community-service-chair'))
        or (event_type = 'hsm_event' and ur.role_slug in ('hsm', 'health-safety-manager'))
        or (event_type in ('new_member_meeting', 'new_member_event') and ur.role_slug in ('membered', 'member-educator'))
        or (event_type = 'philanthropy' and ur.role_slug in ('philo-chair', 'philanthropy-chair'))
        or (event_type = 'professional_development' and ur.role_slug = 'prof-dev')
        or (event_type = 'rush' and ur.role_slug = 'rush-chair')
        or (event_type = 'scholarship' and ur.role_slug = 'scholarship')
        or (event_type in ('house_meeting', 'work_party') and ur.role_slug in ('hm', 'house-manager'))
      )
  )
);

create policy "Event managers can delete allowed events"
on public.events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'rec',
          'recorder'
        )
        or (event_type in ('party', 'formal') and ur.role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'sorority_fraternity' and ur.role_slug = 'social-events')
        or (event_type = 'dei' and ur.role_slug = 'dei-chair')
        or (event_type = 'alumni_event' and ur.role_slug = 'alumni-chair')
        or (event_type = 'brotherhood_event' and ur.role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
        or (event_type = 'community_service' and ur.role_slug in ('cs-chair', 'community-service-chair'))
        or (event_type = 'hsm_event' and ur.role_slug in ('hsm', 'health-safety-manager'))
        or (event_type in ('new_member_meeting', 'new_member_event') and ur.role_slug in ('membered', 'member-educator'))
        or (event_type = 'philanthropy' and ur.role_slug in ('philo-chair', 'philanthropy-chair'))
        or (event_type = 'professional_development' and ur.role_slug = 'prof-dev')
        or (event_type = 'rush' and ur.role_slug = 'rush-chair')
        or (event_type = 'scholarship' and ur.role_slug = 'scholarship')
        or (event_type in ('house_meeting', 'work_party') and ur.role_slug in ('hm', 'house-manager'))
      )
  )
);

notify pgrst, 'reload schema';
