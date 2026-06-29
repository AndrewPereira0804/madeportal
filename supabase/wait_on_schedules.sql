insert into public.roles (slug, name)
values ('stew', 'Steward')
on conflict (slug) do update
set name = excluded.name;

create table if not exists public.wait_on_schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  published boolean not null default false,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wait_on_schedules_week_start_unique unique (week_start)
);

create table if not exists public.wait_on_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.wait_on_schedules(id) on delete cascade,
  slot_key text not null,
  brother_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wait_on_assignments_slot_key_check
    check (
      slot_key in (
        'monday_lunch',
        'monday_dinner',
        'tuesday_lunch',
        'tuesday_dinner',
        'wednesday_lunch',
        'wednesday_dinner',
        'thursday_lunch',
        'thursday_dinner',
        'friday_lunch',
        'saturday_mop',
        'sunday_wait_on'
      )
    ),
  constraint wait_on_assignments_schedule_slot_brother_unique
    unique (schedule_id, slot_key, brother_id)
);

create index if not exists wait_on_assignments_schedule_idx
  on public.wait_on_assignments(schedule_id);

create index if not exists wait_on_assignments_brother_idx
  on public.wait_on_assignments(brother_id);

create index if not exists wait_on_assignments_schedule_slot_idx
  on public.wait_on_assignments(schedule_id, slot_key);

create or replace function public.can_manage_wait_ons(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug in (
          'admin',
          'ea',
          'eda',
          'president',
          'vice-president',
          'vice_president',
          'vp',
          'stew',
          'steward'
        )
    );
$$;

revoke all on function public.can_manage_wait_ons(uuid) from public;
grant execute on function public.can_manage_wait_ons(uuid) to authenticated;

create or replace function public.set_wait_on_schedule_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_wait_on_schedule_updated_at() from public;

drop trigger if exists set_wait_on_schedule_updated_at on public.wait_on_schedules;
create trigger set_wait_on_schedule_updated_at
before update on public.wait_on_schedules
for each row
execute function public.set_wait_on_schedule_updated_at();

grant select, insert, update, delete on public.wait_on_schedules to authenticated;
grant select, insert, update, delete on public.wait_on_assignments to authenticated;
grant select, insert, update, delete on public.wait_on_schedules to service_role;
grant select, insert, update, delete on public.wait_on_assignments to service_role;

alter table public.wait_on_schedules enable row level security;
alter table public.wait_on_assignments enable row level security;

drop policy if exists "Wait-on managers can read all schedules" on public.wait_on_schedules;
drop policy if exists "Active users can read published wait-on schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can insert schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can update schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can delete schedules" on public.wait_on_schedules;

create policy "Wait-on managers can read all schedules"
on public.wait_on_schedules
for select
to authenticated
using (public.can_manage_wait_ons((select auth.uid())));

create policy "Active users can read published wait-on schedules"
on public.wait_on_schedules
for select
to authenticated
using (
  published = true
  and public.is_active((select auth.uid()))
);

create policy "Wait-on managers can insert schedules"
on public.wait_on_schedules
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_manage_wait_ons((select auth.uid()))
);

create policy "Wait-on managers can update schedules"
on public.wait_on_schedules
for update
to authenticated
using (public.can_manage_wait_ons((select auth.uid())))
with check (public.can_manage_wait_ons((select auth.uid())));

create policy "Wait-on managers can delete schedules"
on public.wait_on_schedules
for delete
to authenticated
using (public.can_manage_wait_ons((select auth.uid())));

drop policy if exists "Wait-on managers can read all assignments" on public.wait_on_assignments;
drop policy if exists "Active users can read published wait-on assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can insert assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can update assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can delete assignments" on public.wait_on_assignments;

create policy "Wait-on managers can read all assignments"
on public.wait_on_assignments
for select
to authenticated
using (public.can_manage_wait_ons((select auth.uid())));

create policy "Active users can read published wait-on assignments"
on public.wait_on_assignments
for select
to authenticated
using (
  public.is_active((select auth.uid()))
  and exists (
    select 1
    from public.wait_on_schedules
    where wait_on_schedules.id = wait_on_assignments.schedule_id
      and wait_on_schedules.published = true
  )
);

create policy "Wait-on managers can insert assignments"
on public.wait_on_assignments
for insert
to authenticated
with check (public.can_manage_wait_ons((select auth.uid())));

create policy "Wait-on managers can update assignments"
on public.wait_on_assignments
for update
to authenticated
using (public.can_manage_wait_ons((select auth.uid())))
with check (public.can_manage_wait_ons((select auth.uid())));

create policy "Wait-on managers can delete assignments"
on public.wait_on_assignments
for delete
to authenticated
using (public.can_manage_wait_ons((select auth.uid())));

notify pgrst, 'reload schema';
