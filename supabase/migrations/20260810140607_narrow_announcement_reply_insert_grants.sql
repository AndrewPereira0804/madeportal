revoke insert on table public.announcement_replies from authenticated;
grant insert (announcement_id, author_id, body) on table public.announcement_replies to authenticated;

notify pgrst, 'reload schema';
