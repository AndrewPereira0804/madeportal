create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  contact_type text not null,
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_contacts_contact_type_check
    check (
      contact_type in (
        'mother',
        'father',
        'parent',
        'guardian',
        'sibling',
        'spouse',
        'partner',
        'child',
        'grandparent',
        'aunt_uncle',
        'cousin',
        'friend',
        'roommate',
        'other'
      )
    ),
  constraint emergency_contacts_name_required_check
    check (length(btrim(name)) > 0),
  constraint emergency_contacts_phone_required_check
    check (length(btrim(phone)) > 0),
  constraint emergency_contacts_email_not_blank_check
    check (email is null or length(btrim(email)) > 0)
);

create index if not exists emergency_contacts_user_id_idx
  on public.emergency_contacts(user_id);

create or replace function public.can_read_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
stable
security invoker
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
          'hsm',
          'health-safety-manager'
        )
    );
$$;

revoke all on function public.can_read_all_emergency_contacts(uuid) from public;
grant execute on function public.can_read_all_emergency_contacts(uuid) to authenticated;

create or replace function public.can_manage_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select check_user_id is not null
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$$;

revoke all on function public.can_manage_all_emergency_contacts(uuid) from public;
grant execute on function public.can_manage_all_emergency_contacts(uuid) to authenticated;

create or replace function public.set_emergency_contact_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_emergency_contact_updated_at() from public;

drop trigger if exists set_emergency_contact_updated_at on public.emergency_contacts;
create trigger set_emergency_contact_updated_at
before update on public.emergency_contacts
for each row
execute function public.set_emergency_contact_updated_at();

revoke all on public.emergency_contacts from anon;
revoke all on public.emergency_contacts from public;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
grant select, insert, update, delete on public.emergency_contacts to service_role;

alter table public.emergency_contacts enable row level security;

drop policy if exists "Users can read own emergency contacts" on public.emergency_contacts;
drop policy if exists "Emergency contact readers can read all contacts" on public.emergency_contacts;
drop policy if exists "Users can insert own emergency contacts" on public.emergency_contacts;
drop policy if exists "Users can update own emergency contacts" on public.emergency_contacts;
drop policy if exists "Users can delete own emergency contacts" on public.emergency_contacts;
drop policy if exists "Admins can insert all emergency contacts" on public.emergency_contacts;
drop policy if exists "Admins can update all emergency contacts" on public.emergency_contacts;
drop policy if exists "Admins can delete all emergency contacts" on public.emergency_contacts;
drop policy if exists "Emergency contacts select access" on public.emergency_contacts;
drop policy if exists "Emergency contacts insert access" on public.emergency_contacts;
drop policy if exists "Emergency contacts update access" on public.emergency_contacts;
drop policy if exists "Emergency contacts delete access" on public.emergency_contacts;

create policy "Emergency contacts select access"
on public.emergency_contacts
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_read_all_emergency_contacts((select auth.uid()))
);

create policy "Emergency contacts insert access"
on public.emergency_contacts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or public.can_manage_all_emergency_contacts((select auth.uid()))
);

create policy "Emergency contacts update access"
on public.emergency_contacts
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_all_emergency_contacts((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.can_manage_all_emergency_contacts((select auth.uid()))
);

create policy "Emergency contacts delete access"
on public.emergency_contacts
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_all_emergency_contacts((select auth.uid()))
);

notify pgrst, 'reload schema';
