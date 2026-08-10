alter table public.events
  add column if not exists event_tags text[];

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
    'new_member_event'
  )
);

alter table public.events
  alter column event_tags set default '{}'::text[],
  alter column event_tags set not null;

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
      'new_member_event'
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
