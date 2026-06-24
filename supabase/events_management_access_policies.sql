create or replace function public.can_manage_events(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
        'vp'
      )
  );
$$;

revoke all on function public.can_manage_events(uuid) from public;
grant execute on function public.can_manage_events(uuid) to authenticated;

alter table public.events enable row level security;

drop policy if exists "Event managers can read all events" on public.events;
drop policy if exists "Event managers can insert events" on public.events;
drop policy if exists "Event managers can update all events" on public.events;
drop policy if exists "Event managers can delete all events" on public.events;

create policy "Event managers can read all events"
on public.events
for select
to authenticated
using (public.can_manage_events(auth.uid()));

create policy "Event managers can insert events"
on public.events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_manage_events(auth.uid())
);

create policy "Event managers can update all events"
on public.events
for update
to authenticated
using (public.can_manage_events(auth.uid()))
with check (public.can_manage_events(auth.uid()));

create policy "Event managers can delete all events"
on public.events
for delete
to authenticated
using (public.can_manage_events(auth.uid()));
