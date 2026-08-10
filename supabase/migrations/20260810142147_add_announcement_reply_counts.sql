alter table public.announcements
add column if not exists reply_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_reply_count_non_negative'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
    add constraint announcements_reply_count_non_negative
    check (reply_count >= 0);
  end if;
end $$;

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

create or replace function private.apply_announcement_reply_delta()
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

drop trigger if exists announcement_replies_apply_delta on public.announcement_replies;
create trigger announcement_replies_apply_delta
after insert or delete on public.announcement_replies
for each row
execute function private.apply_announcement_reply_delta();

notify pgrst, 'reload schema';
