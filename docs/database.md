# Database Contract

Last updated: 2026-05-23

## Source Of Truth

Hosted Supabase is currently the canonical database source of truth. This document records the latest schema and RLS policy snapshot provided from the hosted project so code changes can be checked against the database contract before implementation.

Schema exports in this document are for context only. Do not run them directly as migrations because export order, enum placeholders, constraints, policies, and triggers may be incomplete.

Repo SQL files under `supabase/` are rollout/reference scripts. They may differ from hosted state until explicitly verified and applied.

Before database-related changes:

1. Read this file.
2. Check the relevant frontend code.
3. Check the relevant SQL file under `supabase/`.
4. If behavior depends on hosted RLS/policies/functions, ask for a fresh Supabase export before changing assumptions.

## Safety Notes

Do not run `drop function ... cascade` unless the script recreates every dependent policy in the same run. Dropping helper functions with `cascade` can remove RLS policies that depend on those functions. After any cascade-based helper function reset, re-check policies for affected tables in Supabase.

Known example: resetting helper functions can remove announcement policies if hosted policies depend on a dropped function.

## Auth Model

Authentication identities live in `auth.users`.

Application user data lives in `public.profiles`, keyed by `profiles.user_id`, which references `auth.users.id`.

Frontend auth and authorization expectations:

- Login/register use Supabase email/password auth.
- A new registered user inserts a `profiles` row with `status = 'pending'`.
- App routing gates users by `profiles.status`.
- Role checks read `public.user_roles`.

## Status Values

`profiles.status` uses the `user_status` enum.

Expected values:

- `pending`
- `active`
- `suspended`

`announcements.visibility` also uses a user-defined type in the current schema snapshot. Treat it as `user_status` unless a newer schema export says otherwise.

## Tables

### public.majors

Purpose: catalog of academic majors used by profiles.

Columns:

- `id bigint generated always as identity primary key`
- `major text not null`
- `slug text`

Referenced by:

- `profiles.major`

Frontend usage:

- No current frontend workflow has been verified from repo code.

### public.profiles

Purpose: canonical app profile row per authenticated user.

Columns:

- `user_id uuid primary key references auth.users(id)`
- `name text`
- `status user_status not null default 'pending'`
- `created_at timestamptz not null default now()`
- `email text`
- `phone text`
- `grad_year bigint`
- `major bigint references public.majors(id)`
- `hometown text`

Referenced by:

- `user_roles.user_id`
- `announcements.author_id`
- `announcement_likes.user_id`
- `events.created_by`
- `transactions.created_by`

Frontend usage:

- `src/auth/useStatus.tsx` reads `status`.
- `src/pages/Register.tsx` inserts pending profiles.
- `src/pages/app/ManageMembers.tsx` reads profiles and updates status.
- `src/pages/app/Announcement.tsx` reads author names.

### public.roles

Purpose: role catalog.

Columns:

- `slug text primary key`
- `name text not null`

Frontend usage:

- `src/pages/app/ManageMembers.tsx` reads all roles for role editing.

### public.user_roles

Purpose: user-role join table.

Columns:

- `user_id uuid not null references public.profiles(user_id)`
- `role_slug text not null references public.roles(slug)`
- `created_at timestamptz not null default now()`
- primary key: `(user_id, role_slug)`

Frontend usage:

- `src/auth/useRoles.tsx` reads roles for the current user.
- `src/pages/app/ManageMembers.tsx` reads and edits user roles.

### public.announcements

Purpose: announcement feed.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `title text not null`
- `body text`
- `visibility user-defined`
- `author_id uuid not null references public.profiles(user_id)`
- `likes integer default 0 check (likes >= 0)`

Referenced by:

- `announcement_likes.announcement_id`

Frontend usage:

- `src/pages/app/Announcements.tsx` reads and deletes announcements.
- `src/pages/app/CreateAnnouncement.tsx` inserts announcements.
- `src/pages/app/EditAnnouncement.tsx` updates announcements.
- `src/pages/app/Likes.tsx` reads the aggregate `likes` count and toggles the current user's row in `announcement_likes`.

### public.announcement_likes

Purpose: per-user announcement like state.

Columns:

- `announcement_id uuid not null references public.announcements(id)`
- `user_id uuid not null references public.profiles(user_id)`
- `created_at timestamptz not null default now()`
- primary key: `(announcement_id, user_id)`

Frontend usage:

- `src/pages/app/Announcements.tsx` reads current-user liked announcement IDs.
- `src/pages/app/Likes.tsx` inserts a row to like and deletes the current user's row to unlike.

Important: the provided hosted schema export shows foreign keys without `on delete cascade`. If announcement deletion should also delete like rows automatically, verify hosted constraints before relying on that behavior.

### public.events

Purpose: scheduled events.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `title text not null`
- `description text`
- `start timestamp without time zone not null`
- `end timestamp without time zone`
- `created_by uuid default gen_random_uuid() references public.profiles(user_id)`
- `visible_to_alum boolean not null`
- `visible_to_neophyte boolean not null`

Frontend usage:

- `src/pages/app/Scheduling.tsx` reads events.
- `src/pages/app/ManageEvents.tsx` creates, updates, and deletes events.

Important: frontend supplies `created_by`; do not rely on the `gen_random_uuid()` default because it can produce invalid foreign keys.

### public.calendars

Purpose: date windows for scheduling filters.

Columns:

- `id bigint generated always as identity primary key`
- `start date`
- `end date`
- `name text`

Frontend usage:

- `src/pages/app/Scheduling.tsx` reads calendar windows.

### public.budgets

Purpose: budget master records.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `committee text not null`
- `amount double precision`

Frontend usage:

- Current budget page is placeholder.

### public.transactions

Purpose: budget-linked financial records.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `budget_id uuid not null default gen_random_uuid() references public.budgets(id)`
- `amount double precision not null`
- `vendor text default 'N/A'`
- `date timestamp without time zone default now()`
- `created_by uuid default gen_random_uuid() references public.profiles(user_id)`

Frontend usage:

- No current frontend workflow.

Important: `budget_id` and `created_by` defaults can produce invalid foreign keys. Future frontend code should supply explicit valid IDs.

### public.audit_log

Purpose: audit trail for sensitive/admin actions.

Columns:

- `id bigint primary key`
- `actor_id uuid references auth.users(id)`
- `action text not null`
- `target_user_id uuid references auth.users(id)`
- `created_at timestamptz not null default now()`

Frontend usage:

- No current frontend workflow.

## Role Catalog

Current hosted `public.roles` rows:

| Slug | Name |
| --- | --- |
| `admin` | Admin |
| `alum` | Alumni |
| `brother` | Brother |
| `cs-chair` | Community Service Chairman |
| `ea` | Eminent Archon |
| `eda` | Eminent Deputy Archon |
| `hm` | House Manager |
| `hsm` | Health & Safety Manager |
| `membered` | Member Educator |
| `neophyte` | Neophyte |
| `philo-chair` | Philanthropy Chairman |
| `preceptor` | Preceptor |
| `rec` | Recorder |
| `scholarship` | Scholarship Chairman |
| `social-chair` | Social Chairman |
| `stew` | Steward |
| `treasurer` | Treasurer |

Do not infer new permissions from role names alone. Check the permission sections and hosted RLS policies before changing behavior.

## Permission Intent

### Member Management

The Manage Members workflow is available at `/app/manage/members`.

Frontend visibility:

- `admin`
- `ea`
- `eda`

Frontend helper:

- `src/auth/roleAccess.ts`

Database helper:

- `public.can_manage_members(uuid)`

Expected capabilities:

- Read all profiles.
- Update profile status for approve, deny, suspend, and reinstate.
- Read all user role assignments.
- Insert and delete user role assignments.
- Read role catalog.

The legacy `/admin` route redirects to `/app/manage`. `ea` and `eda` should not need the `admin` role to use `/app/manage/members`.

### Announcements

Hosted policy snapshot:

- Active users can read announcements.
- Authenticated active users can insert announcements for themselves.
- Authenticated users can update `likes`.
- Per-user like state should live in `announcement_likes` with one row per `(announcement_id, user_id)`.
- The aggregate `announcements.likes` count should stay aligned with `announcement_likes`.

Repo SQL may not match hosted policy intent. The current hosted `active_users_can_read_announcements` policy is more restrictive than the repo's older `Authenticated users can read announcements` policy.

Important: the latest schema export includes `announcement_likes`, but did not include RLS policy or trigger exports for that table. Treat those as external/unverified state until a fresh policy/function export is provided.

### Events

Hosted policy snapshot:

- Users can select events if they are `brother`, created the event, or are in a visible audience role.
- `alum` can view events where `visible_to_alum` is true.
- `neophyte` can view events where `visible_to_neophyte` is true.
- Users can insert events they own.
- Event owners or `brother` users can update/delete events.

Frontend currently uses a stricter/higher-level role split for event management:

- Full CRUD roles: `admin`, `ea`, `eda`.
- Own-event CRUD roles: `membered`, `scholarship`, `treasurer`, `hm`, `hsm`, `rec`, `stew`.

This is a known area where hosted RLS and frontend role intent should be re-verified before changing event behavior.

### Calendars

Hosted policy snapshot currently allows authenticated users to select, insert, update, and delete calendars.

There are multiple duplicate SELECT policies in hosted state. Treat this as external state to clean up deliberately, not as a frontend bug.

## Helper Functions

### public.is_admin(uuid)

Expected behavior: returns true when the user has `user_roles.role_slug = 'admin'`.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug = 'admin'
  );
$function$;
```

Known dependencies:

- Some repo SQL uses this for admin-only announcement update/delete policies.
- Hosted policy snapshot provided here does not show current announcement policies using `is_admin`, but older repo SQL does.

### public.can_manage_members(uuid)

Expected behavior: returns true when the user has one of:

- `admin`
- `ea`
- `eda`

Used by hosted profile and user role policies for Manage Members.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.can_manage_members(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role_slug in ('admin', 'ea', 'eda')
  );
$function$;
```

### public.is_role_member(text, uuid)

Hosted event and role policies reference `is_role_member(role_slug, user_id)`.

Expected behavior: returns true when the given user has the given role slug in `public.user_roles`.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.is_role_member(p_role_slug text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role_slug = p_role_slug
  );
$function$;
```

### public.is_active(uuid)

Expected behavior: returns true when the user's profile status is `active`.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.is_active(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = uid and status = 'active'
  );
$function$;
```

### public.increment_announcement_likes(uuid)

Previous expected behavior: authenticated users can increment an announcement's `likes` value and receive the new count. Throws if the caller is unauthenticated or the announcement does not exist.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.increment_announcement_likes(a_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  new_likes integer;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.announcements
  SET likes = COALESCE(likes, 0) + 1
  WHERE id = a_id
  RETURNING likes INTO new_likes;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'announcement not found';
  END IF;

  RETURN new_likes;
END;
$function$;
```

Frontend note: `src/pages/app/Likes.tsx` no longer uses this RPC for the like button. Current frontend behavior expects per-user rows in `announcement_likes` so users can unlike and liked state can persist across reloads.

### public.apply_announcement_like_delta()

Expected behavior: trigger helper that increments `announcements.likes` after an `announcement_likes` insert and decrements it after an `announcement_likes` delete.

Repo definition:

- `supabase/announcement_likes.sql`

Hosted status:

- Not included in the latest schema-only export. Verify hosted functions/triggers before assuming the aggregate `announcements.likes` count is maintained automatically.

### public.handle_new_user()

Expected behavior: trigger helper that creates a pending profile row for a new auth user.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (user_id, status)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
```

Trigger attachment was not included in the provided export. Verify hosted triggers before editing registration behavior.

### public.sync_profile_email()

Expected behavior: trigger helper that upserts `profiles.email` from auth user email changes.

Hosted definition:

```sql
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email
    WHERE public.profiles.email IS DISTINCT FROM EXCLUDED.email;

  RETURN NEW;
END;
$function$;
```

Trigger attachment was not included in the provided export. Verify hosted triggers before editing profile email sync behavior.

### public.rls_auto_enable()

Expected behavior: event trigger helper that enables RLS on new `public` tables created by DDL commands.

Hosted definition summary:

- Function type: `event_trigger`
- Language: `plpgsql`
- Security: `SECURITY DEFINER`
- Search path: `pg_catalog`
- Iterates `pg_event_trigger_ddl_commands()`.
- Enables RLS for created tables and partitioned tables in the `public` schema.

Event trigger attachment was not included in the provided export. Verify hosted event triggers before relying on automatic RLS enablement.

### Other Event Helpers

Repo SQL includes `has_role`, `can_full_crud_events`, and `can_create_owned_events`, but hosted policies currently reference `is_role_member`.

Do not assume repo helper names match hosted helper names for events unless the relevant SQL file has been reconciled with hosted functions.

## Hosted RLS Policy Snapshot

This section reflects the policy export provided on 2026-05-23.

### public.announcements

- `active_users_can_read_announcements`
  - SELECT to authenticated.
  - Allows users whose profile status is `active`.
- `authenticated_insert_announcements`
  - INSERT to authenticated.
  - Requires `author_id = auth.uid()` and active profile status.
- `authenticated_update_likes`
  - UPDATE to authenticated.
  - Allows update with `using (true)` and `with check (true)`.

Note: this direct `announcements.likes` update policy is legacy for the current frontend like flow. Current frontend code inserts/deletes rows in `announcement_likes`.

### public.announcement_likes

The latest schema export includes this table, but no RLS policy export was provided for it.

Expected policies for the current frontend:

- Authenticated users can read their own likes.
- Authenticated users can insert their own like rows.
- Authenticated users can delete their own like rows.

External/unverified state: confirm hosted RLS policies before treating like/unlike as deployed.

### public.calendars

- `calendars_select_all_authenticated`
- `calendars_select_authenticated`
- `calendars_select_authenticated_only`
- `calendars_insert_authenticated`
- `calendars_update_authenticated`
- `calendars_delete_authenticated`

All current calendar policies allow authenticated users with `true` predicates.

### public.events

- `events_select_visible`
  - SELECT to authenticated.
  - Allows `brother`, owner, visible alum, or visible neophyte.
- `events_insert_own`
  - INSERT to authenticated.
  - Requires `created_by = auth.uid()`.
- `events_update_allowed`
  - UPDATE to authenticated.
  - Allows owner or `brother`.
- `events_delete_allowed`
  - DELETE to authenticated.
  - Allows owner or `brother`.

### public.profiles

Current hosted policies include both newer member-manager policies and older profile policies:

- `Member managers can read all profiles`
- `Member managers can update all profiles`
- `Users can insert own profile`
- `Users can read own profile`
- `profiles_admin_all`
- `profiles_delete_own`
- `profiles_insert_authenticated`
- `profiles_select_own`
- `profiles_update_own`
- `update_own_profile_while_pending`

This overlap may be intentional or may be cleanup debt. Do not remove policy overlap without confirming desired hosted behavior.

### public.roles

- `Authenticated users can read roles`
  - SELECT to authenticated using `true`.
- `roles_select_for_member`
  - SELECT to authenticated using `is_role_member(slug, auth.uid())`.

### public.user_roles

- `Member managers can delete user roles`
- `Member managers can insert user roles`
- `Member managers can read all user roles`
- `Users can read own roles`
- `read own roles`

`Users can read own roles` and `read own roles` are duplicate in intent. Do not remove either without confirming hosted cleanup.

## Repo SQL Files

### supabase/admin_accounts_policies.sql

Purpose:

- Defines `is_admin`.
- Defines `can_manage_members`.
- Enables RLS on profiles, roles, and user_roles.
- Creates member-management policies.

Warning:

- Current file drops helper functions with `cascade`. If run, verify dependent policies afterwards.

### supabase/announcements_policies.sql

Purpose:

- Enables RLS on announcements.
- Creates announcement read/insert/update/delete policies.

Current mismatch:

- Repo file allows all authenticated users to read announcements.
- Hosted snapshot allows active users to read announcements.
- Repo file includes admin update/delete policies using `is_admin`.
- Hosted snapshot provided does not include those admin update/delete policies.

Treat hosted state as canonical until this is reconciled.

### supabase/announcement_likes.sql

Purpose:

- Creates `announcement_likes` for per-user announcement like state.
- Enables RLS and creates current-user select/insert/delete policies.
- Creates `apply_announcement_like_delta()` and a trigger to keep `announcements.likes` synchronized.
- Notifies PostgREST to reload the schema cache.

Current mismatch:

- The latest hosted schema export shows `announcement_likes` foreign keys without `on delete cascade`; the repo rollout script currently defines cascade behavior for announcement/profile deletion. Verify hosted constraints before relying on automatic cleanup.

### supabase/events_calendar_policies.sql

Purpose:

- Adds event visibility columns.
- Defines event helper functions.
- Creates event and semester policies.

Current mismatch:

- Repo file creates `semesters`, but the latest schema snapshot has `calendars` and no `semesters`.
- Repo file uses helper names different from hosted policies.

Do not run this file against hosted Supabase without a deliberate migration plan.

### supabase/events_management_access_policies.sql

Purpose:

- Adds `public.can_manage_events(uuid)` for full event managers.
- Adds additive event RLS policies so `admin`, `ea`, `eda`, and president/vice-president slug variants can read, create, update, and delete events.

Rollout note:

- This file is intended to fix hosted policy gaps where event managers without the `brother` role cannot view or manage calendar events.
- It does not remove existing event visibility or owner policies.

## Known Drift And Cleanup Items

- `README.md` is currently incomplete and starts with a patch hunk marker.
- README still has older placeholder notes that may not reflect current Scheduling/Event work.
- Hosted calendar policies include duplicate SELECT policies.
- Hosted profile and user role policies include overlapping legacy and new policies.
- Hosted `announcement_likes` policies and aggregate trigger state are not documented in the latest export.
- Repo announcement policies differ from hosted announcement policies.
- Repo `announcement_likes.sql` may differ from hosted foreign-key delete behavior.
- Repo event/calendar policies differ from hosted event/calendar policies.
- Trigger attachments for `handle_new_user`, `sync_profile_email`, and `rls_auto_enable` are not documented yet.

## Future Exports To Add

Ask the user for these before high-risk database work:

- Fresh full schema export.
- Fresh full RLS policy export.
- Trigger definitions/attachments for `announcement_likes_apply_delta`, `handle_new_user`, `sync_profile_email`, and `rls_auto_enable`.
- Any function definitions not listed in this document.
