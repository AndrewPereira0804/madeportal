alter table public.events
  add column if not exists event_type text;

alter table public.events
  add column if not exists details jsonb;

alter table public.events
  add column if not exists event_tags text[];

insert into public.roles (slug, name)
values
  ('alumni-chair', 'Alumni Chairman'),
  ('chapter-dev', 'Chapter Development'),
  ('dei-chair', 'DEI Chairman'),
  ('prof-dev', 'Professional Development Chairman'),
  ('rush-chair', 'Rush Chairman'),
  ('social-events', 'Social Events Chairman')
on conflict (slug) do update
set name = excluded.name;

insert into public.user_roles (user_id, role_slug)
select user_id, 'alumni-chair'
from public.user_roles
where role_slug in ('alum-chair', 'alumni-chairman')
on conflict (user_id, role_slug) do nothing;

delete from public.user_roles
where role_slug in ('alum-chair', 'alumni-chairman');

update public.budget_accounts
set role_slug = 'alumni-chair'
where role_slug in ('alum-chair', 'alumni-chairman');

delete from public.roles
where slug in ('alum-chair', 'alumni-chairman');

insert into public.user_roles (user_id, role_slug)
select user_id, 'prof-dev'
from public.user_roles
where role_slug = 'professional-dev'
on conflict (user_id, role_slug) do nothing;

delete from public.user_roles
where role_slug = 'professional-dev';

update public.budget_accounts
set role_slug = 'prof-dev'
where role_slug = 'professional-dev';

delete from public.roles
where slug = 'professional-dev';

update public.events
set event_type = 'brotherhood_event'
where event_type is null or btrim(event_type) = '';

update public.events
set details = '{}'::jsonb
where details is null
  or jsonb_typeof(details) <> 'object';

update public.events
set event_tags = (
  select coalesce(array_agg(distinct tag order by tag), array[public.events.event_type]::text[])
  from unnest(coalesce(public.events.event_tags, '{}'::text[]) || array[public.events.event_type]) as normalized_tags(tag)
  where tag in (
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
  )
);

alter table public.events
  alter column event_type set default 'brotherhood_event',
  alter column event_type set not null;

alter table public.events
  alter column details set default '{}'::jsonb,
  alter column details set not null;

alter table public.events
  alter column event_tags set default '{}'::text[],
  alter column event_tags set not null;

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
      'new_member_event',
      'other'
    )
  );

alter table public.events
  drop constraint if exists events_details_object_check;

alter table public.events
  add constraint events_details_object_check
  check (jsonb_typeof(details) = 'object');

alter table public.events
  drop constraint if exists events_event_tags_allowed_check,
  drop constraint if exists events_event_tags_include_primary_check,
  drop constraint if exists events_alumni_event_tag_visible_check;

alter table public.events
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

create index if not exists events_event_tags_gin_idx
  on public.events
  using gin (event_tags);

grant insert (event_tags) on public.events to authenticated;
grant update (event_tags) on public.events to authenticated;

notify pgrst, 'reload schema';
