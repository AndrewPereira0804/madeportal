alter table public.events
  drop constraint if exists events_event_type_check,
  drop constraint if exists events_event_tags_allowed_check;

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
  ),
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
  );

notify pgrst, 'reload schema';
