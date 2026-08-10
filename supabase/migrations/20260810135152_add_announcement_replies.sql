create table if not exists public.announcement_replies (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null,
  created_at timestamp with time zone not null default now(),
  constraint announcement_replies_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists announcement_replies_announcement_created_at_idx
on public.announcement_replies (announcement_id, created_at desc);

create index if not exists announcement_replies_author_id_idx
on public.announcement_replies (author_id);

alter table public.announcement_replies enable row level security;

revoke all on table public.announcement_replies from public, anon, authenticated;
grant select, delete on table public.announcement_replies to authenticated;
grant insert (announcement_id, author_id, body) on table public.announcement_replies to authenticated;
grant update (body) on table public.announcement_replies to authenticated;
grant all on table public.announcement_replies to service_role;

drop policy if exists "Active users can read announcement replies" on public.announcement_replies;
drop policy if exists "Active users can reply to announcements" on public.announcement_replies;
drop policy if exists "Authors can update own announcement replies" on public.announcement_replies;
drop policy if exists "Authors and announcement managers can delete replies" on public.announcement_replies;

create policy "Active users can read announcement replies"
on public.announcement_replies
for select
to authenticated
using (
  private.current_user_is_active()
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_replies.announcement_id
      and a.visibility = 'active'::public.user_status
  )
);

create policy "Active users can reply to announcements"
on public.announcement_replies
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and private.current_user_is_active()
  and length(btrim(body)) > 0
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_replies.announcement_id
      and a.visibility = 'active'::public.user_status
  )
);

create policy "Authors can update own announcement replies"
on public.announcement_replies
for update
to authenticated
using (
  author_id = (select auth.uid())
  and private.current_user_is_active()
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_replies.announcement_id
      and a.visibility = 'active'::public.user_status
  )
)
with check (
  author_id = (select auth.uid())
  and private.current_user_is_active()
  and length(btrim(body)) > 0
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_replies.announcement_id
      and a.visibility = 'active'::public.user_status
  )
);

create policy "Authors and announcement managers can delete replies"
on public.announcement_replies
for delete
to authenticated
using (
  private.current_user_is_active()
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_replies.announcement_id
      and a.visibility = 'active'::public.user_status
  )
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp'
        )
    )
  )
);

notify pgrst, 'reload schema';
