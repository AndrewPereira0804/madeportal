create table public.announcement_replies (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null,
  created_at timestamp with time zone not null default now(),
  constraint announcement_replies_body_not_blank check (length(btrim(body)) > 0)
);

create index announcement_replies_announcement_created_at_idx
on public.announcement_replies (announcement_id, created_at desc);

create index announcement_replies_author_id_idx
on public.announcement_replies (author_id);

alter table public.announcement_replies enable row level security;

revoke all on table public.announcement_replies from public, anon, authenticated;
grant select, delete on table public.announcement_replies to authenticated;
grant insert (announcement_id, author_id, body) on table public.announcement_replies to authenticated;
grant update (body) on table public.announcement_replies to authenticated;
grant all on table public.announcement_replies to service_role;

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

alter table public.announcements
add column reply_count integer not null default 0;

alter table public.announcements
add constraint announcements_reply_count_non_negative
check (reply_count >= 0);

update public.announcements a
set reply_count = coalesce(reply_counts.reply_count, 0)
from (
  select
    a2.id,
    count(r.id)::integer as reply_count
  from public.announcements a2
  left join public.announcement_replies r
    on r.announcement_id = a2.id
  group by a2.id
) reply_counts
where reply_counts.id = a.id;

create function private.apply_announcement_reply_delta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    update public.announcements
    set reply_count = coalesce(reply_count, 0) + 1
    where id = new.announcement_id;

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.announcements
    set reply_count = greatest(coalesce(reply_count, 0) - 1, 0)
    where id = old.announcement_id;

    return old;
  end if;

  return null;
end;
$function$;

revoke all on function private.apply_announcement_reply_delta() from public;

create trigger announcement_replies_apply_delta
after insert or delete on public.announcement_replies
for each row
execute function private.apply_announcement_reply_delta();

notify pgrst, 'reload schema';
