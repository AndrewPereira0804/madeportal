create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  check (end_date >= start_date)
);

alter table public.events
  add column if not exists visible_to_alum boolean not null default false,
  add column if not exists visible_to_neophyte boolean not null default false,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null;

create or replace function public.has_role(check_user_id uuid, check_role_slug text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug = check_role_slug
  );
$$;

create or replace function public.can_full_crud_events(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug in ('admin', 'ea', 'eda')
  );
$$;

create or replace function public.can_create_owned_events(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug in ('membered', 'scholarship', 'treasurer', 'hm', 'hsm', 'rec', 'stew')
  );
$$;

revoke all on function public.has_role(uuid, text) from public;
revoke all on function public.can_full_crud_events(uuid) from public;
revoke all on function public.can_create_owned_events(uuid) from public;
grant execute on function public.has_role(uuid, text) to authenticated;
grant execute on function public.can_full_crud_events(uuid) to authenticated;
grant execute on function public.can_create_owned_events(uuid) to authenticated;

alter table public.semesters enable row level security;
alter table public.events enable row level security;

drop policy if exists "Authenticated users can read semesters" on public.semesters;
drop policy if exists "Full event admins can create semesters" on public.semesters;
drop policy if exists "Full event admins can update semesters" on public.semesters;
drop policy if exists "Full event admins can delete semesters" on public.semesters;

create policy "Authenticated users can read semesters"
on public.semesters
for select
to authenticated
using (true);

create policy "Full event admins can create semesters"
on public.semesters
for insert
to authenticated
with check (public.can_full_crud_events(auth.uid()));

create policy "Full event admins can update semesters"
on public.semesters
for update
to authenticated
using (public.can_full_crud_events(auth.uid()))
with check (public.can_full_crud_events(auth.uid()));

create policy "Full event admins can delete semesters"
on public.semesters
for delete
to authenticated
using (public.can_full_crud_events(auth.uid()));

drop policy if exists "Users can read events by role visibility" on public.events;
drop policy if exists "CRUD roles can create events" on public.events;
drop policy if exists "Owners or full event admins can update events" on public.events;
drop policy if exists "Owners or full event admins can delete events" on public.events;

create policy "Users can read events by role visibility"
on public.events
for select
to authenticated
using (
  public.has_role(auth.uid(), 'brother')
  or (visible_to_alum and public.has_role(auth.uid(), 'alum'))
  or (visible_to_neophyte and public.has_role(auth.uid(), 'neophyte'))
  or public.can_full_crud_events(auth.uid())
);

create policy "CRUD roles can create events"
on public.events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.can_full_crud_events(auth.uid())
    or public.can_create_owned_events(auth.uid())
  )
);

create policy "Owners or full event admins can update events"
on public.events
for update
to authenticated
using (
  public.can_full_crud_events(auth.uid())
  or (
    public.can_create_owned_events(auth.uid())
    and created_by = auth.uid()
  )
)
with check (
  public.can_full_crud_events(auth.uid())
  or (
    public.can_create_owned_events(auth.uid())
    and created_by = auth.uid()
  )
);

create policy "Owners or full event admins can delete events"
on public.events
for delete
to authenticated
using (
  public.can_full_crud_events(auth.uid())
  or (
    public.can_create_owned_events(auth.uid())
    and created_by = auth.uid()
  )
);
