alter table public.events
  add column if not exists event_type text;

alter table public.events
  add column if not exists details jsonb;

insert into public.roles (slug, name)
values
  ('alumni-chair', 'Alumni Chairman'),
  ('chapter-dev', 'Chapter Development'),
  ('professional-dev', 'Professional Development')
on conflict (slug) do update
set name = excluded.name;

update public.events
set event_type = 'brotherhood_event'
where event_type is null or btrim(event_type) = '';

update public.events
set details = '{}'::jsonb
where details is null
  or jsonb_typeof(details) <> 'object';

alter table public.events
  alter column event_type set default 'brotherhood_event',
  alter column event_type set not null;

alter table public.events
  alter column details set default '{}'::jsonb,
  alter column details set not null;

alter table public.events
  drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (
    event_type in (
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
      'new_member_event'
    )
  );

alter table public.events
  drop constraint if exists events_details_object_check;

alter table public.events
  add constraint events_details_object_check
  check (jsonb_typeof(details) = 'object');

create or replace function public.can_manage_all_events(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
        'rec',
        'recorder'
      )
  );
$$;

create or replace function public.can_manage_event_type(check_user_id uuid, check_event_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_all_events(check_user_id)
    or exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and (
          (check_event_type in ('party', 'formal') and role_slug in ('social-chair', 'hsm', 'health-safety-manager'))
          or (check_event_type = 'alumni_event' and role_slug in ('alumni-chair', 'alumni-chairman'))
          or (check_event_type = 'brotherhood_event' and role_slug in ('chapter-dev', 'chapter-dev-chair', 'chapter-development', 'chapter-development-chair', 'hsm', 'health-safety-manager'))
          or (check_event_type = 'community_service' and role_slug in ('cs-chair', 'community-service-chair'))
          or (check_event_type = 'hsm_event' and role_slug in ('hsm', 'health-safety-manager'))
          or (check_event_type in ('new_member_meeting', 'new_member_event') and role_slug in ('membered', 'member-educator'))
          or (check_event_type = 'philanthropy' and role_slug in ('philo-chair', 'philanthropy-chair'))
          or (check_event_type = 'professional_development' and role_slug in ('professional-dev', 'professional-dev-chair', 'professional-development', 'professional-development-chair'))
          or (check_event_type = 'scholarship' and role_slug = 'scholarship')
          or (check_event_type = 'work_party' and role_slug in ('hm', 'house-manager'))
        )
    );
$$;

revoke all on function public.can_manage_all_events(uuid) from public;
revoke all on function public.can_manage_event_type(uuid, text) from public;
grant execute on function public.can_manage_all_events(uuid) to authenticated;
grant execute on function public.can_manage_event_type(uuid, text) to authenticated;

alter table public.events enable row level security;

drop policy if exists "Social chair can read party events" on public.events;
drop policy if exists "Social chair can create party events" on public.events;
drop policy if exists "Social chair can update party events" on public.events;
drop policy if exists "Event type managers can read manageable events" on public.events;
drop policy if exists "Event type managers can create manageable events" on public.events;
drop policy if exists "Event type managers can update manageable events" on public.events;
drop policy if exists "Event type managers can delete manageable events" on public.events;

create policy "Event type managers can read manageable events"
on public.events
for select
to authenticated
using (public.can_manage_event_type(auth.uid(), event_type));

create policy "Event type managers can create manageable events"
on public.events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_manage_event_type(auth.uid(), event_type)
);

create policy "Event type managers can update manageable events"
on public.events
for update
to authenticated
using (public.can_manage_event_type(auth.uid(), event_type))
with check (public.can_manage_event_type(auth.uid(), event_type));

create policy "Event type managers can delete manageable events"
on public.events
for delete
to authenticated
using (public.can_manage_event_type(auth.uid(), event_type));

notify pgrst, 'reload schema';
