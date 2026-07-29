-- Moves RLS helper evaluation into a non-exposed schema, locks down direct
-- public RPC access to helper functions, and requires active status for likes.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.is_active(check_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return check_user_id is not null
    and exists (
      select 1
      from public.profiles
      where user_id = check_user_id
        and status = 'active'::public.user_status
    );
end;
$$;

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active((select auth.uid()));
$$;

create or replace function private.user_has_role(check_role_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = check_role_slug
    );
$$;

create or replace function private.user_has_any_role(check_role_slugs text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = any(check_role_slugs)
    );
$$;

create or replace function private.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and private.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$$;

create or replace function private.can_manage_members(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and private.is_active(check_user_id)
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
          'vp'
        )
    );
$$;

create or replace function private.can_manage_wait_ons(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and private.is_active(check_user_id)
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

create or replace function private.can_read_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and private.is_active(check_user_id)
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

create or replace function private.can_manage_all_emergency_contacts(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and private.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$$;

create or replace function private.current_user_can_manage_role_assignment(target_role_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor_roles as (
    select ur.role_slug
    from public.user_roles ur
    join public.profiles p
      on p.user_id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  )
  select coalesce((
    select
      nullif(btrim(target_role_slug), '') is not null
      and (
        exists (
          select 1
          from actor_roles
          where role_slug = 'admin'
        )
        or (
          lower(btrim(target_role_slug)) not in ('admin', 'president', 'ea')
          and exists (
            select 1
            from actor_roles
            where role_slug in ('president', 'ea')
          )
        )
        or (
          lower(btrim(target_role_slug)) not in (
            'admin',
            'president',
            'ea',
            'vice-president',
            'vice_president',
            'vp',
            'eda'
          )
          and exists (
            select 1
            from actor_roles
            where role_slug in ('vice-president', 'vice_president', 'vp', 'eda')
          )
        )
        or (
          lower(btrim(target_role_slug)) not in (
            'admin',
            'president',
            'ea',
            'vice-president',
            'vice_president',
            'vp',
            'eda',
            'rec',
            'recorder'
          )
          and exists (
            select 1
            from actor_roles
            where role_slug in ('rec', 'recorder')
          )
        )
      )
  ), false);
$$;

create or replace function private.current_user_can_insert_role_assignment(
  target_role_slug text,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active(target_user_id)
    and private.current_user_can_manage_role_assignment(target_role_slug);
$$;

create or replace function private.current_user_can_read_role_assignments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_can_manage_role_assignment('brother');
$$;

create or replace function private.is_budget_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_active()
    and private.user_has_any_role(array[
      'admin',
      'ea',
      'eda',
      'treasurer'
    ]);
$$;

create or replace function private.can_access_budget_account(account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_active()
    and (
      private.is_budget_manager()
      or exists (
        select 1
        from public.budget_accounts ba
        join public.user_roles ur
          on ur.role_slug = ba.role_slug
        where ba.id = account_id
          and ur.user_id = (select auth.uid())
      )
    );
$$;

create or replace function private.apply_announcement_like_delta()
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

create or replace function private.prevent_profile_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_user_id uuid := (select auth.uid());
  request_can_manage_members boolean := false;
begin
  if request_user_id is null then
    return new;
  end if;

  request_can_manage_members :=
    private.is_active(request_user_id)
    and private.can_manage_members(request_user_id);

  if not request_can_manage_members then
    if new.user_id is distinct from old.user_id then
      raise exception 'profiles.user_id cannot be changed by this user'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      raise exception 'profiles.status cannot be changed by this user'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.remove_roles_for_inactive_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending'::public.user_status, 'suspended'::public.user_status) then
    delete from public.user_roles
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

create or replace function private.set_emergency_contact_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.set_wait_on_schedule_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all privileges on all functions in schema private from public, anon, authenticated;

grant execute on function private.is_active(uuid) to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.can_manage_members(uuid) to authenticated;
grant execute on function private.can_manage_wait_ons(uuid) to authenticated;
grant execute on function private.can_read_all_emergency_contacts(uuid) to authenticated;
grant execute on function private.can_manage_all_emergency_contacts(uuid) to authenticated;
grant execute on function private.current_user_can_manage_role_assignment(text) to authenticated;
grant execute on function private.current_user_can_insert_role_assignment(text, uuid) to authenticated;
grant execute on function private.current_user_can_read_role_assignments() to authenticated;
grant execute on function private.is_budget_manager() to authenticated;
grant execute on function private.can_access_budget_account(uuid) to authenticated;

alter table public.announcement_likes enable row level security;
revoke all on table public.announcement_likes from public, anon, authenticated;
grant select, insert, delete on table public.announcement_likes to authenticated;

drop policy if exists "Users can read own announcement likes" on public.announcement_likes;
drop policy if exists "Users can like announcements" on public.announcement_likes;
drop policy if exists "Users can unlike own announcement likes" on public.announcement_likes;

create policy "Users can read own announcement likes"
on public.announcement_likes
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_is_active()
);

create policy "Users can like announcements"
on public.announcement_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_is_active()
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_likes.announcement_id
      and a.visibility = 'active'::public.user_status
  )
);

create policy "Users can unlike own announcement likes"
on public.announcement_likes
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_is_active()
);

drop trigger if exists announcement_likes_apply_delta on public.announcement_likes;
create trigger announcement_likes_apply_delta
after insert or delete on public.announcement_likes
for each row
execute function private.apply_announcement_like_delta();

revoke all on table public.audit_log from public, anon, authenticated;
revoke all on table public.transactions from public, anon, authenticated;

revoke all on table public.majors from public, anon, authenticated;
grant select on table public.majors to authenticated;

revoke all on table public.roles from public, anon, authenticated;
grant select on table public.roles to authenticated;

drop policy if exists "roles_select_for_member" on public.roles;
drop policy if exists "Authenticated users can read roles" on public.roles;
create policy "Authenticated users can read roles"
on public.roles
for select
to authenticated
using (true);

revoke all on table public.budget_cycles from public, anon, authenticated;
revoke all on table public.budget_accounts from public, anon, authenticated;
revoke all on table public.budget_transactions from public, anon, authenticated;
grant select, insert, update, delete on table public.budget_cycles to authenticated;
grant select, insert, update, delete on table public.budget_accounts to authenticated;
grant select, insert, update, delete on table public.budget_transactions to authenticated;

drop policy if exists "Active users can view budget cycles" on public.budget_cycles;
drop policy if exists "Budget managers can manage budget cycles" on public.budget_cycles;
create policy "Active users can view budget cycles"
on public.budget_cycles
for select
to authenticated
using (private.current_user_is_active());
create policy "Budget managers can manage budget cycles"
on public.budget_cycles
for all
to authenticated
using (private.is_budget_manager())
with check (private.is_budget_manager());

drop policy if exists "Users can view accessible budget accounts" on public.budget_accounts;
drop policy if exists "Budget managers can manage budget accounts" on public.budget_accounts;
create policy "Users can view accessible budget accounts"
on public.budget_accounts
for select
to authenticated
using (private.can_access_budget_account(id));
create policy "Budget managers can manage budget accounts"
on public.budget_accounts
for all
to authenticated
using (private.is_budget_manager())
with check (private.is_budget_manager());

drop policy if exists "Users can view accessible budget transactions" on public.budget_transactions;
drop policy if exists "Users can submit transactions to accessible budgets" on public.budget_transactions;
drop policy if exists "Budget managers can update budget transactions" on public.budget_transactions;
drop policy if exists "Budget managers can delete budget transactions" on public.budget_transactions;
create policy "Users can view accessible budget transactions"
on public.budget_transactions
for select
to authenticated
using (private.can_access_budget_account(budget_account_id));
create policy "Users can submit transactions to accessible budgets"
on public.budget_transactions
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and private.can_access_budget_account(budget_account_id)
);
create policy "Budget managers can update budget transactions"
on public.budget_transactions
for update
to authenticated
using (private.is_budget_manager())
with check (private.is_budget_manager());
create policy "Budget managers can delete budget transactions"
on public.budget_transactions
for delete
to authenticated
using (private.is_budget_manager());

drop policy if exists "Active users can read active profiles" on public.profiles;
drop policy if exists "Member managers can read all profiles" on public.profiles;
drop policy if exists "Member managers can update profiles" on public.profiles;
drop policy if exists "Role assignment managers can read all profiles" on public.profiles;
create policy "Active users can read active profiles"
on public.profiles
for select
to authenticated
using (
  status = 'active'::public.user_status
  and private.is_active((select auth.uid()))
);
create policy "Member managers can read all profiles"
on public.profiles
for select
to authenticated
using (
  private.is_active((select auth.uid()))
  and private.can_manage_members((select auth.uid()))
);
create policy "Role assignment managers can read all profiles"
on public.profiles
for select
to authenticated
using (private.current_user_can_read_role_assignments());
create policy "Member managers can update profiles"
on public.profiles
for update
to authenticated
using (
  private.is_active((select auth.uid()))
  and private.can_manage_members((select auth.uid()))
)
with check (
  private.is_active((select auth.uid()))
  and private.can_manage_members((select auth.uid()))
);

drop trigger if exists prevent_profile_self_privilege_escalation on public.profiles;
create trigger prevent_profile_self_privilege_escalation
before update on public.profiles
for each row
execute function private.prevent_profile_self_privilege_escalation();

drop trigger if exists remove_roles_for_inactive_profile on public.profiles;
create trigger remove_roles_for_inactive_profile
after update of status on public.profiles
for each row
when (
  new.status is distinct from old.status
  and new.status in ('pending'::public.user_status, 'suspended'::public.user_status)
)
execute function private.remove_roles_for_inactive_profile();

drop policy if exists "Users can read own roles" on public.user_roles;
drop policy if exists "Active users can read active user roles" on public.user_roles;
drop policy if exists "Role assignment managers can read all user roles" on public.user_roles;
drop policy if exists "Role assignment managers can insert allowed user roles" on public.user_roles;
drop policy if exists "Role assignment managers can delete allowed user roles" on public.user_roles;
create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_active((select auth.uid()))
);
create policy "Active users can read active user roles"
on public.user_roles
for select
to authenticated
using (
  private.is_active((select auth.uid()))
  and private.is_active(user_id)
);
create policy "Role assignment managers can read all user roles"
on public.user_roles
for select
to authenticated
using (private.current_user_can_read_role_assignments());
create policy "Role assignment managers can insert allowed user roles"
on public.user_roles
for insert
to authenticated
with check (private.current_user_can_insert_role_assignment(role_slug, user_id));
create policy "Role assignment managers can delete allowed user roles"
on public.user_roles
for delete
to authenticated
using (private.current_user_can_manage_role_assignment(role_slug));

revoke all on table public.emergency_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.emergency_contacts to authenticated;

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
  or private.can_read_all_emergency_contacts((select auth.uid()))
);
create policy "Emergency contacts insert access"
on public.emergency_contacts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or private.can_manage_all_emergency_contacts((select auth.uid()))
);
create policy "Emergency contacts update access"
on public.emergency_contacts
for update
to authenticated
using (
  user_id = (select auth.uid())
  or private.can_manage_all_emergency_contacts((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or private.can_manage_all_emergency_contacts((select auth.uid()))
);
create policy "Emergency contacts delete access"
on public.emergency_contacts
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or private.can_manage_all_emergency_contacts((select auth.uid()))
);

drop trigger if exists set_emergency_contact_updated_at on public.emergency_contacts;
create trigger set_emergency_contact_updated_at
before update on public.emergency_contacts
for each row
execute function private.set_emergency_contact_updated_at();

revoke all on table public.wait_on_schedules from public, anon, authenticated;
revoke all on table public.wait_on_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.wait_on_schedules to authenticated;
grant select, insert, update, delete on table public.wait_on_assignments to authenticated;

drop policy if exists "Wait-on managers can read all schedules" on public.wait_on_schedules;
drop policy if exists "Active users can read published wait-on schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can insert schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can update schedules" on public.wait_on_schedules;
drop policy if exists "Wait-on managers can delete schedules" on public.wait_on_schedules;
create policy "Wait-on managers can read all schedules"
on public.wait_on_schedules
for select
to authenticated
using (private.can_manage_wait_ons((select auth.uid())));
create policy "Active users can read published wait-on schedules"
on public.wait_on_schedules
for select
to authenticated
using (
  published = true
  and private.is_active((select auth.uid()))
);
create policy "Wait-on managers can insert schedules"
on public.wait_on_schedules
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_manage_wait_ons((select auth.uid()))
);
create policy "Wait-on managers can update schedules"
on public.wait_on_schedules
for update
to authenticated
using (private.can_manage_wait_ons((select auth.uid())))
with check (private.can_manage_wait_ons((select auth.uid())));
create policy "Wait-on managers can delete schedules"
on public.wait_on_schedules
for delete
to authenticated
using (private.can_manage_wait_ons((select auth.uid())));

drop policy if exists "Wait-on managers can read all assignments" on public.wait_on_assignments;
drop policy if exists "Active users can read published wait-on assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can insert assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can update assignments" on public.wait_on_assignments;
drop policy if exists "Wait-on managers can delete assignments" on public.wait_on_assignments;
create policy "Wait-on managers can read all assignments"
on public.wait_on_assignments
for select
to authenticated
using (private.can_manage_wait_ons((select auth.uid())));
create policy "Active users can read published wait-on assignments"
on public.wait_on_assignments
for select
to authenticated
using (
  private.is_active((select auth.uid()))
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
with check (private.can_manage_wait_ons((select auth.uid())));
create policy "Wait-on managers can update assignments"
on public.wait_on_assignments
for update
to authenticated
using (private.can_manage_wait_ons((select auth.uid())))
with check (private.can_manage_wait_ons((select auth.uid())));
create policy "Wait-on managers can delete assignments"
on public.wait_on_assignments
for delete
to authenticated
using (private.can_manage_wait_ons((select auth.uid())));

drop trigger if exists set_wait_on_schedule_updated_at on public.wait_on_schedules;
create trigger set_wait_on_schedule_updated_at
before update on public.wait_on_schedules
for each row
execute function private.set_wait_on_schedule_updated_at();

do $$
begin
  if to_regprocedure('public.current_user_is_active()') is not null then
    execute 'revoke all on function public.current_user_is_active() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_active(uuid)') is not null then
    execute 'revoke all on function public.is_active(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_admin(uuid)') is not null then
    execute 'revoke all on function public.is_admin(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.can_manage_members(uuid)') is not null then
    execute 'revoke all on function public.can_manage_members(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.can_manage_wait_ons(uuid)') is not null then
    execute 'revoke all on function public.can_manage_wait_ons(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.can_read_all_emergency_contacts(uuid)') is not null then
    execute 'revoke all on function public.can_read_all_emergency_contacts(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.can_manage_all_emergency_contacts(uuid)') is not null then
    execute 'revoke all on function public.can_manage_all_emergency_contacts(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.current_user_can_manage_role_assignment(text)') is not null then
    execute 'revoke all on function public.current_user_can_manage_role_assignment(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.current_user_can_insert_role_assignment(text, uuid)') is not null then
    execute 'revoke all on function public.current_user_can_insert_role_assignment(text, uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.current_user_can_read_role_assignments()') is not null then
    execute 'revoke all on function public.current_user_can_read_role_assignments() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.user_has_role(text)') is not null then
    execute 'revoke all on function public.user_has_role(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.user_has_any_role(text[])') is not null then
    execute 'revoke all on function public.user_has_any_role(text[]) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_role_member(text, uuid)') is not null then
    execute 'revoke all on function public.is_role_member(text, uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_budget_manager()') is not null then
    execute 'revoke all on function public.is_budget_manager() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.can_access_budget_account(uuid)') is not null then
    execute 'revoke all on function public.can_access_budget_account(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke all on function public.handle_new_user() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.sync_profile_email()') is not null then
    execute 'revoke all on function public.sync_profile_email() from public, anon, authenticated';
  end if;
end $$;

drop function if exists public.increment_announcement_likes(uuid);
drop function if exists public.can_manage_event_type(uuid, text);
drop function if exists public.can_manage_events(uuid);
drop function if exists public.can_manage_all_events(uuid);
drop function if exists public.apply_announcement_like_delta();
drop function if exists public.prevent_profile_self_privilege_escalation();
drop function if exists public.remove_roles_for_inactive_profile();
drop function if exists public.set_emergency_contact_updated_at();
drop function if exists public.set_wait_on_schedule_updated_at();

notify pgrst, 'reload schema';
