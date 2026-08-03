-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION IF EXISTS pg_net;

CREATE EXTENSION hypopg WITH SCHEMA extensions;

CREATE EXTENSION index_advisor WITH SCHEMA extensions;

CREATE SCHEMA private AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA private TO authenticated;

GRANT USAGE ON SCHEMA private TO service_role;

CREATE FUNCTION private.apply_announcement_like_delta()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.apply_announcement_like_delta() FROM PUBLIC;

CREATE FUNCTION private.can_access_budget_account (
  account_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.can_access_budget_account(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_access_budget_account(uuid) TO authenticated;

CREATE FUNCTION private.can_manage_all_emergency_contacts (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and private.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$function$;

REVOKE ALL ON FUNCTION private.can_manage_all_emergency_contacts(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_manage_all_emergency_contacts(uuid) TO authenticated;

CREATE FUNCTION private.can_manage_members (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.can_manage_members(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_manage_members(uuid) TO authenticated;

CREATE FUNCTION private.can_manage_wait_ons (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.can_manage_wait_ons(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_manage_wait_ons(uuid) TO authenticated;

CREATE FUNCTION private.can_read_all_emergency_contacts (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.can_read_all_emergency_contacts(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_read_all_emergency_contacts(uuid) TO authenticated;

CREATE FUNCTION private.current_user_can_insert_role_assignment (
  target_role_slug text,
  target_user_id   uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.is_active(target_user_id)
    and private.current_user_can_manage_role_assignment(target_role_slug);
$function$;

REVOKE ALL ON FUNCTION private.current_user_can_insert_role_assignment(text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.current_user_can_insert_role_assignment(text, uuid) TO authenticated;

CREATE FUNCTION private.current_user_can_manage_role_assignment (
  target_role_slug text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.current_user_can_manage_role_assignment(text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.current_user_can_manage_role_assignment(text) TO authenticated;

CREATE FUNCTION private.current_user_can_read_role_assignments()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.current_user_can_manage_role_assignment('brother');
$function$;

REVOKE ALL ON FUNCTION private.current_user_can_read_role_assignments() FROM PUBLIC;

GRANT ALL ON FUNCTION private.current_user_can_read_role_assignments() TO authenticated;

CREATE FUNCTION private.current_user_is_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.is_active((select auth.uid()));
$function$;

REVOKE ALL ON FUNCTION private.current_user_is_active() FROM PUBLIC;

GRANT ALL ON FUNCTION private.current_user_is_active() TO authenticated;

CREATE FUNCTION private.is_active (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.is_active(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.is_active(uuid) TO authenticated;

CREATE FUNCTION private.is_admin (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and private.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$function$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;

CREATE FUNCTION private.is_budget_manager()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.current_user_is_active()
    and private.user_has_any_role(array[
      'admin',
      'ea',
      'eda',
      'treasurer'
    ]);
$function$;

REVOKE ALL ON FUNCTION private.is_budget_manager() FROM PUBLIC;

GRANT ALL ON FUNCTION private.is_budget_manager() TO authenticated;

CREATE FUNCTION private.prevent_profile_self_privilege_escalation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION private.prevent_profile_self_privilege_escalation() FROM PUBLIC;

CREATE FUNCTION private.remove_roles_for_inactive_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.status in ('pending'::public.user_status, 'suspended'::public.user_status) then
    delete from public.user_roles
    where user_id = new.user_id;
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.remove_roles_for_inactive_profile() FROM PUBLIC;

CREATE FUNCTION private.set_emergency_contact_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.set_emergency_contact_updated_at() FROM PUBLIC;

CREATE FUNCTION private.set_wait_on_schedule_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.set_wait_on_schedule_updated_at() FROM PUBLIC;

CREATE FUNCTION private.user_has_any_role (
  check_role_slugs text[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = any(check_role_slugs)
    );
$function$;

REVOKE ALL ON FUNCTION private.user_has_any_role(text[]) FROM PUBLIC;

CREATE FUNCTION private.user_has_role (
  check_role_slug text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select private.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = check_role_slug
    );
$function$;

REVOKE ALL ON FUNCTION private.user_has_role(text) FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE TYPE public.user_status AS ENUM (
  'pending',
  'active',
  'suspended'
);

CREATE SEQUENCE public.audit_log_id_seq;

CREATE FUNCTION public.can_access_budget_account (
  account_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    public.current_user_is_active()
    and (
      public.is_budget_manager()
      or exists (
        select 1
        from public.budget_accounts ba
        join public.user_roles ur
          on ur.role_slug = ba.role_slug
        where ba.id = account_id
          and ur.user_id = auth.uid()
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_access_budget_account(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_access_budget_account(uuid) TO service_role;

CREATE FUNCTION public.can_manage_all_emergency_contacts (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_all_emergency_contacts(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_manage_all_emergency_contacts(uuid) TO service_role;

CREATE FUNCTION public.can_manage_members (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and public.is_active(check_user_id)
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
$function$;

REVOKE ALL ON FUNCTION public.can_manage_members(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_manage_members(uuid) TO service_role;

CREATE FUNCTION public.can_manage_wait_ons (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and public.is_active(check_user_id)
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
$function$;

REVOKE ALL ON FUNCTION public.can_manage_wait_ons(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_manage_wait_ons(uuid) TO service_role;

CREATE FUNCTION public.can_read_all_emergency_contacts (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and public.is_active(check_user_id)
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
$function$;

REVOKE ALL ON FUNCTION public.can_read_all_emergency_contacts(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_read_all_emergency_contacts(uuid) TO service_role;

CREATE FUNCTION public.current_user_can_insert_role_assignment (
  target_role_slug text,
  target_user_id   uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_active(target_user_id)
    and public.current_user_can_manage_role_assignment(target_role_slug);
$function$;

REVOKE ALL ON FUNCTION public.current_user_can_insert_role_assignment(text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.current_user_can_insert_role_assignment(text, uuid) TO service_role;

CREATE FUNCTION public.current_user_can_manage_role_assignment (
  target_role_slug text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.current_user_can_manage_role_assignment(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.current_user_can_manage_role_assignment(text) TO service_role;

CREATE FUNCTION public.current_user_can_read_role_assignments()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.current_user_can_manage_role_assignment('brother');
$function$;

REVOKE ALL ON FUNCTION public.current_user_can_read_role_assignments() FROM PUBLIC;

GRANT ALL ON FUNCTION public.current_user_can_read_role_assignments() TO service_role;

CREATE FUNCTION public.current_user_is_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'active'::public.user_status
  );
$function$;

REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC;

GRANT ALL ON FUNCTION public.current_user_is_active() TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (user_id, name, email, status)
  values (new.id, profile_name, new.email, 'pending')
  on conflict (user_id) do update
    set
      name = coalesce(nullif(btrim(public.profiles.name), ''), excluded.name),
      email = excluded.email
    where public.profiles.email is distinct from excluded.email
       or (
         excluded.name is not null
         and nullif(btrim(public.profiles.name), '') is null
       );

  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.is_active (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  -- Critical: ensure any reads performed inside do not invoke RLS policies again
  PERFORM set_config('row_security', 'off', true);

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = check_user_id
      AND status = 'active'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_active(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_active(uuid) TO service_role;

CREATE FUNCTION public.is_admin (
  check_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select check_user_id is not null
    and public.is_active(check_user_id)
    and exists (
      select 1
      from public.user_roles
      where user_id = check_user_id
        and role_slug = 'admin'
    );
$function$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_admin(uuid) TO service_role;

CREATE FUNCTION public.is_budget_manager()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    public.current_user_is_active()
    and public.user_has_any_role(array[
      'admin',
      'ea',
      'eda',
      'treasurer'
    ]);
$function$;

REVOKE ALL ON FUNCTION public.is_budget_manager() FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_budget_manager() TO service_role;

CREATE FUNCTION public.is_role_member (
  p_role_slug text,
  p_user_id   uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select p_user_id is not null
    and public.is_active(p_user_id)
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.role_slug = p_role_slug
    );
$function$;

REVOKE ALL ON FUNCTION public.is_role_member(text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_role_member(text, uuid) TO service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE FUNCTION public.sync_profile_email()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (user_id, name, email, status)
  values (new.id, profile_name, new.email, 'pending')
  on conflict (user_id) do update
    set
      name = coalesce(nullif(btrim(public.profiles.name), ''), excluded.name),
      email = excluded.email
    where public.profiles.email is distinct from excluded.email
       or (
         excluded.name is not null
         and nullif(btrim(public.profiles.name), '') is null
       );

  return new;
end;
$function$;

CREATE TRIGGER auth_users_sync_profile_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC;

GRANT ALL ON FUNCTION public.sync_profile_email() TO service_role;

CREATE FUNCTION public.user_has_any_role (
  check_role_slugs text[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = any(check_role_slugs)
    );
$function$;

REVOKE ALL ON FUNCTION public.user_has_any_role(text[]) FROM PUBLIC;

GRANT ALL ON FUNCTION public.user_has_any_role(text[]) TO service_role;

CREATE FUNCTION public.user_has_role (
  check_role_slug text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role_slug = check_role_slug
    );
$function$;

REVOKE ALL ON FUNCTION public.user_has_role(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.user_has_role(text) TO service_role;

CREATE TABLE public.announcement_likes (
  announcement_id uuid                     NOT NULL,
  user_id         uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.announcement_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcement_likes
  ADD CONSTRAINT announcement_likes_pkey PRIMARY KEY (announcement_id, user_id);

GRANT DELETE, INSERT, SELECT ON public.announcement_likes TO authenticated;

GRANT ALL ON public.announcement_likes TO service_role;

CREATE TRIGGER announcement_likes_apply_delta
  AFTER INSERT OR DELETE ON public.announcement_likes
  FOR EACH ROW
  EXECUTE FUNCTION private.apply_announcement_like_delta();

CREATE POLICY "Users can read own announcement likes" ON public.announcement_likes
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_is_active()));

CREATE POLICY "Users can unlike own announcement likes" ON public.announcement_likes
  FOR DELETE
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_is_active()));

CREATE TABLE public.announcements (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  title      text                     NOT NULL,
  body       text,
  visibility public.user_status,
  author_id  uuid                     NOT NULL,
  likes      integer                  DEFAULT 0
);

CREATE POLICY "Users can like announcements" ON public.announcement_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.current_user_is_active() AND (EXISTS ( SELECT 1
   FROM public.announcements a
  WHERE ((a.id = announcement_likes.announcement_id) AND (a.visibility = 'active'::public.user_status))))));

ALTER TABLE public.announcements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_likes_non_negative CHECK (likes >= 0);

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

ALTER TABLE public.announcement_likes
  ADD CONSTRAINT announcement_likes_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;

GRANT DELETE, SELECT ON public.announcements TO authenticated;

GRANT INSERT (author_id, body, title, visibility) ON public.announcements TO authenticated;

GRANT UPDATE (body, title, visibility) ON public.announcements TO authenticated;

GRANT ALL ON public.announcements TO service_role;

CREATE TABLE public.audit_log (
  id             bigint                   DEFAULT nextval('public.audit_log_id_seq'::regclass) NOT NULL,
  actor_id       uuid,
  action         text                     NOT NULL,
  target_user_id uuid,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;

ALTER TABLE public.audit_log
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT ALL ON public.audit_log TO service_role;

CREATE TABLE public.budget_accounts (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  cycle_id         uuid                     NOT NULL,
  role_slug        text                     NOT NULL,
  allocated_amount numeric(10,2)            DEFAULT 0 NOT NULL,
  notes            text,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  created_by       uuid
);

ALTER TABLE public.budget_accounts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_allocated_amount_check CHECK (allocated_amount >= 0::numeric);

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_cycle_id_role_slug_key UNIQUE (cycle_id, role_slug);

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_pkey PRIMARY KEY (id);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.budget_accounts TO authenticated;

GRANT ALL ON public.budget_accounts TO service_role;

CREATE POLICY "Budget managers can manage budget accounts" ON public.budget_accounts
  TO authenticated
  USING (private.is_budget_manager())
  WITH CHECK (private.is_budget_manager());

CREATE POLICY "Users can view accessible budget accounts" ON public.budget_accounts
  FOR SELECT
  TO authenticated
  USING (private.can_access_budget_account(id));

CREATE TABLE public.budget_cycles (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  start_date date                     NOT NULL,
  end_date   date                     NOT NULL,
  is_active  boolean                  DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);

ALTER TABLE public.budget_cycles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.budget_cycles
  ADD CONSTRAINT budget_cycles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.budget_cycles
  ADD CONSTRAINT budget_cycles_pkey PRIMARY KEY (id);

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.budget_cycles(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.budget_cycles TO authenticated;

GRANT ALL ON public.budget_cycles TO service_role;

CREATE POLICY "Active users can view budget cycles" ON public.budget_cycles
  FOR SELECT
  TO authenticated
  USING (private.current_user_is_active());

CREATE POLICY "Budget managers can manage budget cycles" ON public.budget_cycles
  TO authenticated
  USING (private.is_budget_manager())
  WITH CHECK (private.is_budget_manager());

CREATE TABLE public.budget_transactions (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  budget_account_id uuid                     NOT NULL,
  submitted_by      uuid                     NOT NULL,
  amount            numeric(10,2)            NOT NULL,
  vendor            text,
  category          text,
  description       text                     NOT NULL,
  transaction_date  date                     DEFAULT CURRENT_DATE NOT NULL,
  status            text                     DEFAULT 'submitted'::text NOT NULL,
  receipt_url       text,
  approved_by       uuid,
  approved_at       timestamp with time zone,
  denial_reason     text,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.budget_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_amount_check CHECK (amount > 0::numeric);

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_budget_account_id_fkey FOREIGN KEY (budget_account_id) REFERENCES public.budget_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_status_check CHECK (status = ANY (ARRAY['submitted'::text, 'approved'::text, 'denied'::text, 'reimbursed'::text]));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.budget_transactions TO authenticated;

GRANT ALL ON public.budget_transactions TO service_role;

CREATE POLICY "Budget managers can delete budget transactions" ON public.budget_transactions
  FOR DELETE
  TO authenticated
  USING (private.is_budget_manager());

CREATE POLICY "Budget managers can update budget transactions" ON public.budget_transactions
  FOR UPDATE
  TO authenticated
  USING (private.is_budget_manager())
  WITH CHECK (private.is_budget_manager());

CREATE POLICY "Users can submit transactions to accessible budgets" ON public.budget_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = 'submitted'::text) AND private.can_access_budget_account(budget_account_id)));

CREATE POLICY "Users can view accessible budget transactions" ON public.budget_transactions
  FOR SELECT
  TO authenticated
  USING (private.can_access_budget_account(budget_account_id));

CREATE TABLE public.calendars (
  id    bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  start date,
  "end" date,
  name  text
);

ALTER TABLE public.calendars
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.calendars
  ADD CONSTRAINT calendars_pkey PRIMARY KEY (id);

GRANT DELETE, SELECT ON public.calendars TO authenticated;

GRANT INSERT, UPDATE ("end", name, start) ON public.calendars TO authenticated;

GRANT ALL ON public.calendars TO service_role;

CREATE TABLE public.emergency_contacts (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  contact_type text                     NOT NULL,
  name         text                     NOT NULL,
  phone        text                     NOT NULL,
  email        text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.emergency_contacts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_contact_type_check
    CHECK
    (contact_type = ANY (ARRAY['mother'::text, 'father'::text, 'parent'::text, 'guardian'::text, 'sibling'::text, 'spouse'::text, 'partner'::text, 'child'::text,
    'grandparent'::text, 'aunt_uncle'::text, 'cousin'::text, 'friend'::text, 'roommate'::text, 'other'::text]));

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_email_not_blank_check CHECK (email IS NULL OR length(btrim(email)) > 0);

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_name_required_check CHECK (length(btrim(name)) > 0);

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_phone_required_check CHECK (length(btrim(phone)) > 0);

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.emergency_contacts TO authenticated;

GRANT ALL ON public.emergency_contacts TO service_role;

CREATE INDEX emergency_contacts_user_id_idx ON public.emergency_contacts (user_id);

CREATE TRIGGER set_emergency_contact_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.set_emergency_contact_updated_at();

CREATE POLICY "Emergency contacts delete access" ON public.emergency_contacts
  FOR DELETE
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_all_emergency_contacts(( SELECT auth.uid() AS uid))));

CREATE POLICY "Emergency contacts insert access" ON public.emergency_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_all_emergency_contacts(( SELECT auth.uid() AS uid))));

CREATE POLICY "Emergency contacts select access" ON public.emergency_contacts
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_read_all_emergency_contacts(( SELECT auth.uid() AS uid))));

CREATE POLICY "Emergency contacts update access" ON public.emergency_contacts
  FOR UPDATE
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_all_emergency_contacts(( SELECT auth.uid() AS uid))))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_all_emergency_contacts(( SELECT auth.uid() AS uid))));

CREATE TABLE public.events (
  created_at          timestamp with time zone    DEFAULT now() NOT NULL,
  title               text                        NOT NULL,
  id                  uuid                        DEFAULT gen_random_uuid() NOT NULL,
  description         text,
  start               timestamp without time zone NOT NULL,
  "end"               timestamp without time zone NOT NULL,
  created_by          uuid                        NOT NULL,
  visible_to_alum     boolean                     NOT NULL,
  visible_to_neophyte boolean                     NOT NULL,
  event_type          text                        DEFAULT 'brotherhood_event'::text NOT NULL,
  details             jsonb                       DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.events
  ADD CONSTRAINT events_alumni_event_visible_check CHECK (event_type <> 'alumni_event'::text OR visible_to_alum IS TRUE);

ALTER TABLE public.events
  ADD CONSTRAINT events_details_object_check CHECK (jsonb_typeof(details) = 'object'::text);

ALTER TABLE public.events
  ADD CONSTRAINT events_end_after_start_check CHECK ("end" > start);

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
    CHECK
    (event_type = ANY (ARRAY['party'::text, 'formal'::text, 'sorority_fraternity'::text, 'dei'::text, 'community_service'::text, 'philanthropy'::text, 'house_meeting'::text,
    'alumni_event'::text,
    'rush'::text,
    'scholarship'::text, 'professional_development'::text, 'brotherhood_event'::text, 'hsm_event'::text, 'work_party'::text, 'new_member_meeting'::text, 'new_member_event'::text]));

ALTER TABLE public.events
  ADD CONSTRAINT events_pkey PRIMARY KEY (id);

ALTER TABLE public.events
  ADD CONSTRAINT events_title_not_blank_check CHECK (btrim(title) <> ''::text);

GRANT DELETE, SELECT ON public.events TO authenticated;

GRANT INSERT ("end", created_by, description, details, event_type, start, title, visible_to_alum, visible_to_neophyte) ON public.events TO authenticated;

GRANT UPDATE ("end", description, details, event_type, start, title, visible_to_alum, visible_to_neophyte) ON public.events TO authenticated;

GRANT ALL ON public.events TO service_role;

CREATE TABLE public.majors (
  id    bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  major text   NOT NULL,
  slug  text
);

ALTER TABLE public.majors
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.majors
  ADD CONSTRAINT majors_pkey PRIMARY KEY (id);

GRANT SELECT ON public.majors TO authenticated;

GRANT ALL ON public.majors TO service_role;

CREATE POLICY "Authenticated users can read majors" ON public.majors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.profiles (
  user_id    uuid                     NOT NULL,
  name       text,
  status     public.user_status       DEFAULT 'pending'::public.user_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  email      text,
  phone      text,
  grad_year  bigint,
  major      bigint,
  hometown   text
);

CREATE POLICY "Active users can read visible announcements" ON public.announcements
  FOR SELECT
  TO authenticated
  USING (((visibility = 'active'::public.user_status) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status))))));

CREATE POLICY "Active users can read calendars" ON public.calendars
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))));

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_major_fkey FOREIGN KEY (major) REFERENCES public.majors(id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE public.announcement_likes
  ADD CONSTRAINT announcement_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(user_id);

ALTER TABLE public.budget_transactions
  ADD CONSTRAINT budget_transactions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(user_id);

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.events
  ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT INSERT (email, grad_year, hometown, major, name, phone, status, user_id) ON public.profiles TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;

GRANT UPDATE (grad_year, hometown, major, name, phone, status) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE TRIGGER prevent_profile_self_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_profile_self_privilege_escalation();

CREATE TRIGGER remove_roles_for_inactive_profile
  AFTER UPDATE OF status ON public.profiles
  FOR EACH ROW
  WHEN (new.status IS DISTINCT FROM old.status AND (new.status = ANY (ARRAY['pending'::public.user_status, 'suspended'::public.user_status])))
  EXECUTE FUNCTION private.remove_roles_for_inactive_profile();

CREATE POLICY "Active users can read active profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((status = 'active'::public.user_status) AND private.is_active(( SELECT auth.uid() AS uid))));

CREATE POLICY "Member managers can read all profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((private.is_active(( SELECT auth.uid() AS uid)) AND private.can_manage_members(( SELECT auth.uid() AS uid))));

CREATE POLICY "Member managers can update profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((private.is_active(( SELECT auth.uid() AS uid)) AND private.can_manage_members(( SELECT auth.uid() AS uid))))
  WITH CHECK ((private.is_active(( SELECT auth.uid() AS uid)) AND private.can_manage_members(( SELECT auth.uid() AS uid))));

CREATE POLICY "Role assignment managers can read all profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (private.current_user_can_read_role_assignments());

CREATE POLICY "Users can insert own pending profile" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::public.user_status)));

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Users can update own profile details" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.roles (
  slug text NOT NULL,
  name text NOT NULL
);

ALTER TABLE public.roles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_pkey PRIMARY KEY (slug);

ALTER TABLE public.budget_accounts
  ADD CONSTRAINT budget_accounts_role_slug_fkey FOREIGN KEY (role_slug) REFERENCES public.roles(slug) ON DELETE RESTRICT;

GRANT SELECT ON public.roles TO authenticated;

GRANT ALL ON public.roles TO service_role;

CREATE POLICY "Authenticated users can read roles" ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.transactions (
  id         uuid                        DEFAULT gen_random_uuid() NOT NULL,
  budget_id  uuid                        DEFAULT gen_random_uuid() NOT NULL,
  amount     double precision            NOT NULL,
  vendor     text                        DEFAULT 'N/A'::text,
  date       timestamp without time zone DEFAULT now(),
  created_by uuid                        DEFAULT gen_random_uuid()
);

ALTER TABLE public.transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

GRANT ALL ON public.transactions TO service_role;

CREATE TABLE public.user_roles (
  user_id    uuid                     NOT NULL,
  role_slug  text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "Authors and admins can update announcements" ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (((visibility = 'active'::public.user_status) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND ((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = 'admin'::text)))))))
  WITH CHECK (((visibility = 'active'::public.user_status) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND ((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = 'admin'::text)))))));

CREATE POLICY "Authors and announcement managers can delete announcements" ON public.announcements
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND ((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text, 'vp'::text]))))))));

CREATE POLICY "Permitted roles can insert announcements" ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (visibility = 'active'::public.user_status) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'alumni-chair'::text,
    'chapter-dev'::text,
    'chapter-dev-chair'::text,
    'chapter-development'::text,
    'chapter-development-chair'::text,
    'cs-chair'::text,
    'community-service-chair'::text,
    'dei-chair'::text,
    'hm'::text,
    'house-manager'::text,
    'hsm'::text,
    'health-safety-manager'::text,
    'membered'::text,
    'member-educator'::text,
    'philo-chair'::text,
    'philanthropy-chair'::text,
    'preceptor'::text,
    'prof-dev'::text,
    'rec'::text, 'recorder'::text, 'rush-chair'::text, 'scholarship'::text, 'social-chair'::text, 'social-events'::text, 'stew'::text, 'steward'::text, 'treasurer'::text])))))));

CREATE POLICY "Calendar managers can delete calendars" ON public.calendars
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text, 'vp'::text, 'rec'::text, 'recorder'::text])))))));

CREATE POLICY "Calendar managers can insert calendars" ON public.calendars
  FOR INSERT
  TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text, 'vp'::text, 'rec'::text, 'recorder'::text])))))));

CREATE POLICY "Calendar managers can update calendars" ON public.calendars
  FOR UPDATE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text, 'vp'::text, 'rec'::text, 'recorder'::text])))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text, 'vp'::text, 'rec'::text, 'recorder'::text])))))));

CREATE POLICY "Active users can read permitted events" ON public.events
  FOR SELECT
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'rec'::text,
    'recorder'::text,
    'brother'::text])) OR
    ((events.event_type = ANY (ARRAY['party'::text, 'formal'::text])) AND (ur.role_slug = ANY (ARRAY['social-chair'::text, 'hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = 'sorority_fraternity'::text) AND (ur.role_slug = 'social-events'::text)) OR ((events.event_type = 'dei'::text) AND (ur.role_slug = 'dei-chair'::text)) OR
    ((events.event_type = 'alumni_event'::text) AND (ur.role_slug = 'alumni-chair'::text)) OR
    ((events.event_type = 'brotherhood_event'::text) AND (ur.role_slug = ANY (ARRAY['chapter-dev'::text, 'chapter-dev-chair'::text, 'chapter-development'::text,
    'chapter-development-chair'::text,
    'hsm'::text,
    'health-safety-manager'::text]))) OR ((events.event_type = 'community_service'::text) AND (ur.role_slug = ANY (ARRAY['cs-chair'::text, 'community-service-chair'::text]))) OR
    ((events.event_type = 'hsm_event'::text) AND (ur.role_slug = ANY (ARRAY['hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = ANY (ARRAY['new_member_meeting'::text, 'new_member_event'::text])) AND (ur.role_slug = ANY (ARRAY['membered'::text, 'member-educator'::text]))) OR
    ((events.event_type = 'philanthropy'::text) AND (ur.role_slug = ANY (ARRAY['philo-chair'::text, 'philanthropy-chair'::text]))) OR
    ((events.event_type = 'professional_development'::text) AND (ur.role_slug = 'prof-dev'::text)) OR ((events.event_type = 'rush'::text) AND (ur.role_slug = 'rush-chair'::text))
    OR ((events.event_type = 'scholarship'::text) AND (ur.role_slug = 'scholarship'::text)) OR
    ((events.event_type = ANY (ARRAY['house_meeting'::text, 'work_party'::text])) AND (ur.role_slug = ANY (ARRAY['hm'::text, 'house-manager'::text]))))))) OR
    ((visible_to_neophyte IS TRUE) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = 'neophyte'::text))))) OR
    (((visible_to_alum IS TRUE) OR (event_type = 'alumni_event'::text)) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role_slug = ANY (ARRAY['alum'::text, 'alumni'::text])))))))));

CREATE POLICY "Approved event roles can insert events" ON public.events
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    (((created_by = ( SELECT auth.uid() AS uid)) AND (btrim(title) <> ''::text) AND ("end" > start) AND (jsonb_typeof(details) = 'object'::text) AND ((event_type <>
    'alumni_event'::text) OR (visible_to_alum IS TRUE)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'rec'::text,
    'recorder'::text])) OR
    ((events.event_type = ANY (ARRAY['party'::text, 'formal'::text])) AND (ur.role_slug = ANY (ARRAY['social-chair'::text, 'hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = 'sorority_fraternity'::text) AND (ur.role_slug = 'social-events'::text)) OR ((events.event_type = 'dei'::text) AND (ur.role_slug = 'dei-chair'::text)) OR
    ((events.event_type = 'alumni_event'::text) AND (ur.role_slug = 'alumni-chair'::text)) OR
    ((events.event_type = 'brotherhood_event'::text) AND (ur.role_slug = ANY (ARRAY['chapter-dev'::text, 'chapter-dev-chair'::text, 'chapter-development'::text,
    'chapter-development-chair'::text,
    'hsm'::text,
    'health-safety-manager'::text]))) OR ((events.event_type = 'community_service'::text) AND (ur.role_slug = ANY (ARRAY['cs-chair'::text, 'community-service-chair'::text]))) OR
    ((events.event_type = 'hsm_event'::text) AND (ur.role_slug = ANY (ARRAY['hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = ANY (ARRAY['new_member_meeting'::text, 'new_member_event'::text])) AND (ur.role_slug = ANY (ARRAY['membered'::text, 'member-educator'::text]))) OR
    ((events.event_type = 'philanthropy'::text) AND (ur.role_slug = ANY (ARRAY['philo-chair'::text, 'philanthropy-chair'::text]))) OR
    ((events.event_type = 'professional_development'::text) AND (ur.role_slug = 'prof-dev'::text)) OR ((events.event_type = 'rush'::text) AND (ur.role_slug = 'rush-chair'::text))
    OR ((events.event_type = 'scholarship'::text) AND (ur.role_slug = 'scholarship'::text)) OR
    ((events.event_type = ANY (ARRAY['house_meeting'::text, 'work_party'::text])) AND (ur.role_slug = ANY (ARRAY['hm'::text, 'house-manager'::text])))))))));

CREATE POLICY "Event managers can delete allowed events" ON public.events
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'rec'::text,
    'recorder'::text])) OR
    ((events.event_type = ANY (ARRAY['party'::text, 'formal'::text])) AND (ur.role_slug = ANY (ARRAY['social-chair'::text, 'hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = 'sorority_fraternity'::text) AND (ur.role_slug = 'social-events'::text)) OR ((events.event_type = 'dei'::text) AND (ur.role_slug = 'dei-chair'::text)) OR
    ((events.event_type = 'alumni_event'::text) AND (ur.role_slug = 'alumni-chair'::text)) OR
    ((events.event_type = 'brotherhood_event'::text) AND (ur.role_slug = ANY (ARRAY['chapter-dev'::text, 'chapter-dev-chair'::text, 'chapter-development'::text,
    'chapter-development-chair'::text,
    'hsm'::text,
    'health-safety-manager'::text]))) OR ((events.event_type = 'community_service'::text) AND (ur.role_slug = ANY (ARRAY['cs-chair'::text, 'community-service-chair'::text]))) OR
    ((events.event_type = 'hsm_event'::text) AND (ur.role_slug = ANY (ARRAY['hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = ANY (ARRAY['new_member_meeting'::text, 'new_member_event'::text])) AND (ur.role_slug = ANY (ARRAY['membered'::text, 'member-educator'::text]))) OR
    ((events.event_type = 'philanthropy'::text) AND (ur.role_slug = ANY (ARRAY['philo-chair'::text, 'philanthropy-chair'::text]))) OR
    ((events.event_type = 'professional_development'::text) AND (ur.role_slug = 'prof-dev'::text)) OR ((events.event_type = 'rush'::text) AND (ur.role_slug = 'rush-chair'::text))
    OR ((events.event_type = 'scholarship'::text) AND (ur.role_slug = 'scholarship'::text)) OR
    ((events.event_type = ANY (ARRAY['house_meeting'::text, 'work_party'::text])) AND (ur.role_slug = ANY (ARRAY['hm'::text, 'house-manager'::text])))))))));

CREATE POLICY "Event managers can update allowed events" ON public.events
  FOR UPDATE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'rec'::text,
    'recorder'::text])) OR
    ((events.event_type = ANY (ARRAY['party'::text, 'formal'::text])) AND (ur.role_slug = ANY (ARRAY['social-chair'::text, 'hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = 'sorority_fraternity'::text) AND (ur.role_slug = 'social-events'::text)) OR ((events.event_type = 'dei'::text) AND (ur.role_slug = 'dei-chair'::text)) OR
    ((events.event_type = 'alumni_event'::text) AND (ur.role_slug = 'alumni-chair'::text)) OR
    ((events.event_type = 'brotherhood_event'::text) AND (ur.role_slug = ANY (ARRAY['chapter-dev'::text, 'chapter-dev-chair'::text, 'chapter-development'::text,
    'chapter-development-chair'::text,
    'hsm'::text,
    'health-safety-manager'::text]))) OR ((events.event_type = 'community_service'::text) AND (ur.role_slug = ANY (ARRAY['cs-chair'::text, 'community-service-chair'::text]))) OR
    ((events.event_type = 'hsm_event'::text) AND (ur.role_slug = ANY (ARRAY['hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = ANY (ARRAY['new_member_meeting'::text, 'new_member_event'::text])) AND (ur.role_slug = ANY (ARRAY['membered'::text, 'member-educator'::text]))) OR
    ((events.event_type = 'philanthropy'::text) AND (ur.role_slug = ANY (ARRAY['philo-chair'::text, 'philanthropy-chair'::text]))) OR
    ((events.event_type = 'professional_development'::text) AND (ur.role_slug = 'prof-dev'::text)) OR ((events.event_type = 'rush'::text) AND (ur.role_slug = 'rush-chair'::text))
    OR ((events.event_type = 'scholarship'::text) AND (ur.role_slug = 'scholarship'::text)) OR
    ((events.event_type = ANY (ARRAY['house_meeting'::text, 'work_party'::text])) AND (ur.role_slug = ANY (ARRAY['hm'::text, 'house-manager'::text])))))))))
  WITH CHECK (((created_by IS
    NOT NULL) AND (btrim(title) <> ''::text) AND ("end" > start) AND (jsonb_typeof(details) = 'object'::text) AND
    ((event_type <> 'alumni_event'::text) OR (visible_to_alum IS TRUE)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::public.user_status)))) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE
    ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((ur.role_slug = ANY (ARRAY['admin'::text, 'ea'::text, 'eda'::text, 'president'::text, 'vice-president'::text,
    'vice_president'::text,
    'vp'::text,
    'rec'::text,
    'recorder'::text])) OR
    ((events.event_type = ANY (ARRAY['party'::text, 'formal'::text])) AND (ur.role_slug = ANY (ARRAY['social-chair'::text, 'hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = 'sorority_fraternity'::text) AND (ur.role_slug = 'social-events'::text)) OR ((events.event_type = 'dei'::text) AND (ur.role_slug = 'dei-chair'::text)) OR
    ((events.event_type = 'alumni_event'::text) AND (ur.role_slug = 'alumni-chair'::text)) OR
    ((events.event_type = 'brotherhood_event'::text) AND (ur.role_slug = ANY (ARRAY['chapter-dev'::text, 'chapter-dev-chair'::text, 'chapter-development'::text,
    'chapter-development-chair'::text,
    'hsm'::text,
    'health-safety-manager'::text]))) OR ((events.event_type = 'community_service'::text) AND (ur.role_slug = ANY (ARRAY['cs-chair'::text, 'community-service-chair'::text]))) OR
    ((events.event_type = 'hsm_event'::text) AND (ur.role_slug = ANY (ARRAY['hsm'::text, 'health-safety-manager'::text]))) OR
    ((events.event_type = ANY (ARRAY['new_member_meeting'::text, 'new_member_event'::text])) AND (ur.role_slug = ANY (ARRAY['membered'::text, 'member-educator'::text]))) OR
    ((events.event_type = 'philanthropy'::text) AND (ur.role_slug = ANY (ARRAY['philo-chair'::text, 'philanthropy-chair'::text]))) OR
    ((events.event_type = 'professional_development'::text) AND (ur.role_slug = 'prof-dev'::text)) OR ((events.event_type = 'rush'::text) AND (ur.role_slug = 'rush-chair'::text))
    OR ((events.event_type = 'scholarship'::text) AND (ur.role_slug = 'scholarship'::text)) OR
    ((events.event_type = ANY (ARRAY['house_meeting'::text, 'work_party'::text])) AND (ur.role_slug = ANY (ARRAY['hm'::text, 'house-manager'::text])))))))));

ALTER TABLE public.user_roles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_slug);

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_slug_fkey FOREIGN KEY (role_slug) REFERENCES public.roles(slug) ON DELETE CASCADE;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

GRANT DELETE, SELECT ON public.user_roles TO authenticated;

GRANT INSERT (role_slug, user_id) ON public.user_roles TO authenticated;

GRANT ALL ON public.user_roles TO service_role;

CREATE INDEX user_roles_user_id_idx ON public.user_roles (user_id);

CREATE POLICY "Active users can read active user roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ((private.is_active(( SELECT auth.uid() AS uid)) AND private.is_active(user_id)));

CREATE POLICY "Role assignment managers can delete allowed user roles" ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (private.current_user_can_manage_role_assignment(role_slug));

CREATE POLICY "Role assignment managers can insert allowed user roles" ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (private.current_user_can_insert_role_assignment(role_slug, user_id));

CREATE POLICY "Role assignment managers can read all user roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (private.current_user_can_read_role_assignments());

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_active(( SELECT auth.uid() AS uid))));

CREATE TABLE public.wait_on_assignments (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  schedule_id uuid                     NOT NULL,
  slot_key    text                     NOT NULL,
  brother_id  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.wait_on_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wait_on_assignments
  ADD CONSTRAINT wait_on_assignments_brother_id_fkey FOREIGN KEY (brother_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.wait_on_assignments
  ADD CONSTRAINT wait_on_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.wait_on_assignments
  ADD CONSTRAINT wait_on_assignments_schedule_slot_brother_unique UNIQUE (schedule_id, slot_key, brother_id);

ALTER TABLE public.wait_on_assignments
  ADD CONSTRAINT wait_on_assignments_slot_key_check
    CHECK
    (slot_key = ANY (ARRAY['monday_lunch'::text, 'monday_dinner'::text, 'tuesday_lunch'::text, 'tuesday_dinner'::text, 'wednesday_lunch'::text, 'wednesday_dinner'::text,
    'thursday_lunch'::text, 'thursday_dinner'::text, 'friday_lunch'::text, 'saturday_mop'::text, 'sunday_wait_on'::text]));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.wait_on_assignments TO authenticated;

GRANT ALL ON public.wait_on_assignments TO service_role;

CREATE INDEX wait_on_assignments_schedule_slot_idx ON public.wait_on_assignments (schedule_id, slot_key);

CREATE INDEX wait_on_assignments_schedule_idx ON public.wait_on_assignments (schedule_id);

CREATE INDEX wait_on_assignments_brother_idx ON public.wait_on_assignments (brother_id);

CREATE POLICY "Wait-on managers can delete assignments" ON public.wait_on_assignments
  FOR DELETE
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE POLICY "Wait-on managers can insert assignments" ON public.wait_on_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE POLICY "Wait-on managers can read all assignments" ON public.wait_on_assignments
  FOR SELECT
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE POLICY "Wait-on managers can update assignments" ON public.wait_on_assignments
  FOR UPDATE
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)))
  WITH CHECK (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE TABLE public.wait_on_schedules (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  week_start date                     NOT NULL,
  published  boolean                  DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "Active users can read published wait-on assignments" ON public.wait_on_assignments
  FOR SELECT
  TO authenticated
  USING ((private.is_active(( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.wait_on_schedules
  WHERE ((wait_on_schedules.id = wait_on_assignments.schedule_id) AND (wait_on_schedules.published = true))))));

ALTER TABLE public.wait_on_schedules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wait_on_schedules
  ADD CONSTRAINT wait_on_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.wait_on_schedules
  ADD CONSTRAINT wait_on_schedules_pkey PRIMARY KEY (id);

ALTER TABLE public.wait_on_assignments
  ADD CONSTRAINT wait_on_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.wait_on_schedules(id) ON DELETE CASCADE;

ALTER TABLE public.wait_on_schedules
  ADD CONSTRAINT wait_on_schedules_week_start_unique UNIQUE (week_start);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.wait_on_schedules TO authenticated;

GRANT ALL ON public.wait_on_schedules TO service_role;

CREATE TRIGGER set_wait_on_schedule_updated_at
  BEFORE UPDATE ON public.wait_on_schedules
  FOR EACH ROW
  EXECUTE FUNCTION private.set_wait_on_schedule_updated_at();

CREATE POLICY "Active users can read published wait-on schedules" ON public.wait_on_schedules
  FOR SELECT
  TO authenticated
  USING (((published = true) AND private.is_active(( SELECT auth.uid() AS uid))));

CREATE POLICY "Wait-on managers can delete schedules" ON public.wait_on_schedules
  FOR DELETE
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE POLICY "Wait-on managers can insert schedules" ON public.wait_on_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND private.can_manage_wait_ons(( SELECT auth.uid() AS uid))));

CREATE POLICY "Wait-on managers can read all schedules" ON public.wait_on_schedules
  FOR SELECT
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE POLICY "Wait-on managers can update schedules" ON public.wait_on_schedules
  FOR UPDATE
  TO authenticated
  USING (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)))
  WITH CHECK (private.can_manage_wait_ons(( SELECT auth.uid() AS uid)));

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
