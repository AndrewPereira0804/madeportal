alter table public.calendars enable row level security;

revoke all on public.calendars from anon;
revoke all on public.calendars from public;
revoke all on public.calendars from authenticated;

grant select on public.calendars to authenticated;
grant insert (start, "end", name) on public.calendars to authenticated;
grant update (start, "end", name) on public.calendars to authenticated;
grant delete on public.calendars to authenticated;

do $$
declare
  calendar_id_sequence regclass;
begin
  select pg_get_serial_sequence('public.calendars', 'id')::regclass
    into calendar_id_sequence;

  if calendar_id_sequence is not null then
    execute format('revoke all on sequence %s from anon', calendar_id_sequence);
    execute format('revoke all on sequence %s from public', calendar_id_sequence);
    execute format('revoke all on sequence %s from authenticated', calendar_id_sequence);
    execute format('grant usage, select on sequence %s to authenticated', calendar_id_sequence);
  end if;
end $$;

drop policy if exists "calendars_select_all_authenticated" on public.calendars;
drop policy if exists "calendars_select_authenticated" on public.calendars;
drop policy if exists "calendars_select_authenticated_only" on public.calendars;
drop policy if exists "calendars_insert_authenticated" on public.calendars;
drop policy if exists "calendars_update_authenticated" on public.calendars;
drop policy if exists "calendars_delete_authenticated" on public.calendars;
drop policy if exists "Active users can read calendars" on public.calendars;
drop policy if exists "Calendar managers can insert calendars" on public.calendars;
drop policy if exists "Calendar managers can update calendars" on public.calendars;
drop policy if exists "Calendar managers can delete calendars" on public.calendars;

create policy "Active users can read calendars"
on public.calendars
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
);

create policy "Calendar managers can insert calendars"
on public.calendars
for insert
to authenticated
with check (
  exists (
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
        'rec',
        'recorder'
      )
  )
);

create policy "Calendar managers can update calendars"
on public.calendars
for update
to authenticated
using (
  exists (
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
        'rec',
        'recorder'
      )
  )
)
with check (
  exists (
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
        'rec',
        'recorder'
      )
  )
);

create policy "Calendar managers can delete calendars"
on public.calendars
for delete
to authenticated
using (
  exists (
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
        'rec',
        'recorder'
      )
  )
);

notify pgrst, 'reload schema';
