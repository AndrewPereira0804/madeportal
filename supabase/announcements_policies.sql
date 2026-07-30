alter table public.announcements enable row level security;

revoke all on public.announcements from anon;
revoke all on public.announcements from public;
revoke all on public.announcements from authenticated;

grant select on public.announcements to authenticated;
grant insert (title, body, author_id, visibility) on public.announcements to authenticated;
grant update (title, body, visibility) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;

drop policy if exists "Authenticated users can read announcements" on public.announcements;
drop policy if exists "Authenticated users can insert announcements" on public.announcements;
drop policy if exists "Authors can update own announcements" on public.announcements;
drop policy if exists "Admins can update any announcement" on public.announcements;
drop policy if exists "Authors can delete own announcements" on public.announcements;
drop policy if exists "Admins can delete any announcement" on public.announcements;
drop policy if exists "active_users_can_read_announcements" on public.announcements;
drop policy if exists "authenticated_insert_announcements" on public.announcements;
drop policy if exists "authenticated_update_likes" on public.announcements;
drop policy if exists "Active users can read visible announcements" on public.announcements;
drop policy if exists "Permitted roles can insert announcements" on public.announcements;
drop policy if exists "Authors can update own visible announcements" on public.announcements;
drop policy if exists "Announcement managers can update announcements" on public.announcements;
drop policy if exists "Admins can update announcements" on public.announcements;
drop policy if exists "Authors and admins can update announcements" on public.announcements;
drop policy if exists "Authors and announcement managers can delete announcements" on public.announcements;
drop policy if exists "Announcement managers can delete announcements" on public.announcements;

create policy "Active users can read visible announcements"
on public.announcements
for select
to authenticated
using (
  visibility = 'active'::public.user_status
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
);

create policy "Permitted roles can insert announcements"
on public.announcements
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and visibility = 'active'::public.user_status
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and exists (
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
        'vp',
        'alum-chair',
        'alumni-chair',
        'alumni-chairman',
        'chapter-dev',
        'chapter-dev-chair',
        'chapter-development',
        'chapter-development-chair',
        'cs-chair',
        'community-service-chair',
        'dei-chair',
        'hm',
        'house-manager',
        'hsm',
        'health-safety-manager',
        'membered',
        'member-educator',
        'philo-chair',
        'philanthropy-chair',
        'preceptor',
        'prof-dev',
        'rec',
        'recorder',
        'rush-chair',
        'scholarship',
        'social-chair',
        'social-events',
        'stew',
        'steward',
        'treasurer'
      )
  )
);

create policy "Authors and admins can update announcements"
on public.announcements
for update
to authenticated
using (
  visibility = 'active'::public.user_status
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug in (
          'admin'
        )
    )
  )
)
with check (
  visibility = 'active'::public.user_status
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug in (
          'admin'
        )
    )
  )
);

create policy "Authors and announcement managers can delete announcements"
on public.announcements
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
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
