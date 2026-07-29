-- Baseline per-user announcement likes setup.
-- Apply supabase/helper_hardening.sql after this file for the current hosted
-- private-trigger helper, active-status like policies, and grant cleanup.

create table if not exists public.announcement_likes (
    announcement_id uuid not null references public.announcements(id) on delete cascade,
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (announcement_id, user_id)
);

alter table public.announcement_likes enable row level security;

grant select, insert, delete on public.announcement_likes to authenticated;

drop policy if exists "Users can read own announcement likes" on public.announcement_likes;
drop policy if exists "Users can like announcements" on public.announcement_likes;
drop policy if exists "Users can unlike own announcement likes" on public.announcement_likes;

create policy "Users can read own announcement likes"
on public.announcement_likes
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can like announcements"
on public.announcement_likes
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can unlike own announcement likes"
on public.announcement_likes
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.apply_announcement_like_delta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        update public.announcements
        set likes = coalesce(likes, 0) + 1
        where id = new.announcement_id;

        return new;
    end if;

    if tg_op = 'DELETE' then
        update public.announcements
        set likes = greatest(coalesce(likes, 0) - 1, 0)
        where id = old.announcement_id;

        return old;
    end if;

    return null;
end;
$$;

drop trigger if exists announcement_likes_apply_delta on public.announcement_likes;

create trigger announcement_likes_apply_delta
after insert or delete on public.announcement_likes
for each row
execute function public.apply_announcement_like_delta();

notify pgrst, 'reload schema';
