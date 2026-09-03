create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null,
  notes text,
  recorded_by uuid default auth.uid() references public.profiles(user_id) on delete set null,
  recorded_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.event_attendance
  drop constraint if exists event_attendance_event_member_unique,
  drop constraint if exists event_attendance_status_check,
  drop constraint if exists event_attendance_notes_not_blank_check;

alter table public.event_attendance
  add constraint event_attendance_event_member_unique unique (event_id, member_id),
  add constraint event_attendance_status_check
  check (status in ('present', 'excused', 'absent')),
  add constraint event_attendance_notes_not_blank_check
  check (notes is null or btrim(notes) <> '');

create index if not exists event_attendance_member_id_idx
  on public.event_attendance(member_id);

create index if not exists event_attendance_event_status_idx
  on public.event_attendance(event_id, status);

create or replace function private.set_event_attendance_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();

  if new.status is distinct from old.status or new.notes is distinct from old.notes then
    new.recorded_at = now();
  end if;

  return new;
end;
$$;

revoke all on function private.set_event_attendance_updated_at() from public;
revoke all on function private.set_event_attendance_updated_at() from anon;
revoke all on function private.set_event_attendance_updated_at() from authenticated;

create or replace function private.require_house_meeting_attendance_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events
    where id = new.event_id
      and event_type = 'house_meeting'
  ) then
    raise exception 'attendance can only be recorded for house meeting events';
  end if;

  return new;
end;
$$;

revoke all on function private.require_house_meeting_attendance_event() from public;
revoke all on function private.require_house_meeting_attendance_event() from anon;
revoke all on function private.require_house_meeting_attendance_event() from authenticated;

drop trigger if exists set_event_attendance_updated_at on public.event_attendance;
create trigger set_event_attendance_updated_at
before update on public.event_attendance
for each row
execute function private.set_event_attendance_updated_at();

drop trigger if exists require_house_meeting_attendance_event on public.event_attendance;
create trigger require_house_meeting_attendance_event
before insert or update of event_id on public.event_attendance
for each row
execute function private.require_house_meeting_attendance_event();

alter table public.event_attendance enable row level security;

revoke all on public.event_attendance from anon;
revoke all on public.event_attendance from public;
revoke all on public.event_attendance from authenticated;

grant select on public.event_attendance to authenticated;
grant insert (
  event_id,
  member_id,
  status,
  notes,
  recorded_by,
  recorded_at
) on public.event_attendance to authenticated;
grant update (
  status,
  notes,
  recorded_by,
  recorded_at
) on public.event_attendance to authenticated;

drop policy if exists "Recorders can read house meeting attendance" on public.event_attendance;
drop policy if exists "Recorders can insert house meeting attendance" on public.event_attendance;
drop policy if exists "Recorders can update house meeting attendance" on public.event_attendance;

create policy "Recorders can read house meeting attendance"
on public.event_attendance
for select
to authenticated
using (
  private.current_user_is_active()
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role_slug in ('rec', 'recorder')
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.event_type = 'house_meeting'
  )
);

create policy "Recorders can insert house meeting attendance"
on public.event_attendance
for insert
to authenticated
with check (
  private.current_user_is_active()
  and recorded_by = (select auth.uid())
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role_slug in ('rec', 'recorder')
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.event_type = 'house_meeting'
  )
  and exists (
    select 1
    from public.profiles p
    where p.user_id = member_id
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = member_id
      and ur.role_slug in ('brother', 'neophyte')
  )
);

create policy "Recorders can update house meeting attendance"
on public.event_attendance
for update
to authenticated
using (
  private.current_user_is_active()
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role_slug in ('rec', 'recorder')
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.event_type = 'house_meeting'
  )
)
with check (
  private.current_user_is_active()
  and recorded_by = (select auth.uid())
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role_slug in ('rec', 'recorder')
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.event_type = 'house_meeting'
  )
  and exists (
    select 1
    from public.profiles p
    where p.user_id = member_id
      and p.status = 'active'::public.user_status
  )
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = member_id
      and ur.role_slug in ('brother', 'neophyte')
  )
);

notify pgrst, 'reload schema';
