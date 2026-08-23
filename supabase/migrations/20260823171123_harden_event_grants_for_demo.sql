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

notify pgrst, 'reload schema';
