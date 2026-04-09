alter table public.announcements enable row level security;

drop policy if exists "Authenticated users can read announcements" on public.announcements;
drop policy if exists "Authenticated users can insert announcements" on public.announcements;
drop policy if exists "Authors can update own announcements" on public.announcements;
drop policy if exists "Admins can update any announcement" on public.announcements;
drop policy if exists "Authors can delete own announcements" on public.announcements;
drop policy if exists "Admins can delete any announcement" on public.announcements;

create policy "Authenticated users can read announcements"
on public.announcements
for select
to authenticated
using (true);

create policy "Authenticated users can insert announcements"
on public.announcements
for insert
to authenticated
with check (author_id = auth.uid());

create policy "Authors can update own announcements"
on public.announcements
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Admins can update any announcement"
on public.announcements
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Authors can delete own announcements"
on public.announcements
for delete
to authenticated
using (author_id = auth.uid());

create policy "Admins can delete any announcement"
on public.announcements
for delete
to authenticated
using (public.is_admin(auth.uid()));
