# Database Contract

Last updated: 2026-06-29

## Source Of Truth

Hosted Supabase is currently the canonical database source of truth. The user-provided hosted schema and RLS policy exports from 2026-06-25 supersede older notes in this repo unless the user says they are outdated. The wait-on scheduler tables and RLS policies were applied and verified through the Supabase plugin on 2026-06-29. Function bodies and trigger attachments outside the verified sections still reflect the latest available export or repo SQL noted in each section, and must be treated as external/unverified state when a fresh hosted export is not available.

Schema exports in this document are for context only. Do not run them directly as migrations because export order, enum placeholders, constraints, policies, and triggers may be incomplete.

Repo SQL files under `supabase/` are rollout/reference scripts. They may differ from hosted state until explicitly verified and applied.

Before database-related changes:

1. Read this file.
2. Check the relevant frontend code.
3. Check the relevant SQL file under `supabase/`.
4. If behavior depends on hosted functions/triggers or policies not covered by the latest provided export, ask for a fresh Supabase export before changing assumptions.

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
- `budget_accounts.created_by`
- `budget_transactions.submitted_by`
- `budget_transactions.approved_by`
- `wait_on_schedules.created_by`
- `wait_on_assignments.brother_id`

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
- `event_type text not null default 'brotherhood_event'`
- `details jsonb not null default '{}'::jsonb`

Event type constraints:

- The 2026-06-25 hosted schema export allows: `party`, `formal`, `sorority_fraternity`, `dei`, `community_service`, `philanthropy`, `house_meeting`, `alumni_event`, `rush`, `scholarship`, `professional_development`, `brotherhood_event`, `work_party`, `new_member_meeting`, `new_member_event`.
- The current repo rollout adds `hsm_event`; apply `supabase/event_types.sql` before creating HSM events.
- `details` must be a JSON object.
- `supabase/event_types.sql` remains the repo reconciliation/reference script for environments that do not yet have these columns or constraints.

Frontend usage:

- `src/pages/app/Scheduling.tsx` reads events.
- `src/pages/app/ManageEvents.tsx` creates, updates, and deletes events.
- `src/pages/app/tools/PartyEventsTool.tsx` creates party events and updates party event `details` from the Social Chair and HSM tool pages.
- `src/pages/app/tools/FormalEventsTool.tsx` creates formal events and updates formal event `details` for cost, attendee, payment, and setup checklist state from the Social Chair and HSM tool pages.
- `src/pages/app/tools/CommunityServiceEventsTool.tsx` creates community service events and updates event `details` for organization, location, attendance hours, and Nationals logging state.
- `src/pages/app/tools/AlumniEventsTool.tsx` creates alumni events and stores the required public `location` value in `details`.
- `src/pages/app/tools/ProfessionalDevelopmentEventsTool.tsx` creates professional development events and stores an optional public `speaker` value in `details`.

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

### public.transactions

Purpose: legacy budget-linked financial records from the older budget model.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `budget_id uuid not null default gen_random_uuid()`
- `amount double precision not null`
- `vendor text default 'N/A'`
- `date timestamp without time zone default now()`
- `created_by uuid default gen_random_uuid() references public.profiles(user_id)`

Frontend usage:

- No current frontend workflow.

Important:

- The 2026-06-25 hosted schema export did not include `public.budgets` or a foreign key from `transactions.budget_id`.
- Current frontend budget work should use `budget_cycles`, `budget_accounts`, and `budget_transactions` instead.
- `budget_id` and `created_by` defaults can produce invalid IDs. Do not build new budget workflows on this table without a deliberate migration plan.

### public.budget_cycles

Purpose: budget period/cycle records.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `start_date date not null`
- `end_date date not null`
- `is_active boolean not null default false`
- `created_at timestamptz not null default now()`
- `created_by uuid references auth.users(id)`

Referenced by:

- `budget_accounts.cycle_id`

Frontend usage:

- `src/lib/budgetQueries.ts` reads, creates, and marks active budget cycles.
- `src/pages/app/tools/TreasurerBudgetTools.tsx`, `src/pages/budget/BudgetPage.tsx`, and `src/pages/BudgetAdminPage.tsx` read active cycle state for Treasurer budget tools.

### public.budget_accounts

Purpose: role-scoped budget allocations within a cycle.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `cycle_id uuid not null references public.budget_cycles(id)`
- `role_slug text not null references public.roles(slug)`
- `allocated_amount numeric not null default 0 check (allocated_amount >= 0)`
- `notes text`
- `created_at timestamptz not null default now()`
- `created_by uuid references public.profiles(user_id)`

Referenced by:

- `budget_transactions.budget_account_id`

Frontend usage:

- `src/lib/budgetQueries.ts` reads, creates, updates, and deletes budget accounts.
- `src/pages/app/tools/TreasurerBudgetTools.tsx`, `src/pages/budget/BudgetPage.tsx`, `src/pages/budget/BudgetAccountPage.tsx`, `src/pages/BudgetAdminPage.tsx`, and `src/pages/app/tools/ChairTools.tsx` read account allocations.

### public.budget_transactions

Purpose: expense and reimbursement records for budget accounts.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `budget_account_id uuid not null references public.budget_accounts(id)`
- `submitted_by uuid not null references public.profiles(user_id)`
- `amount numeric not null check (amount > 0)`
- `vendor text`
- `category text`
- `description text not null`
- `transaction_date date not null default current_date`
- `status text not null default 'submitted'`
- `receipt_url text`
- `approved_by uuid references public.profiles(user_id)`
- `approved_at timestamptz`
- `denial_reason text`
- `created_at timestamptz not null default now()`

Current hosted constraints from the 2026-06-25 schema export:

- `status` must be one of: `submitted`, `approved`, `denied`, `reimbursed`.

Frontend usage:

- `src/lib/budgetQueries.ts` reads, inserts, approves, denies, and reimburses budget transactions.
- `src/components/budget/SubmitExpenseForm.tsx` inserts submitted transactions.
- Treasurer tools, account detail, admin review, and chair tool views display these records.

### public.wait_on_schedules

Purpose: weekly wait-on schedule container for Steward assignments.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `week_start date not null unique`
- `published boolean not null default false`
- `created_by uuid references public.profiles(user_id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Referenced by:

- `wait_on_assignments.schedule_id`

Frontend usage:

- `src/pages/app/tools/StewardWaitOnTool.tsx` creates/updates weekly schedules and publish state.
- `src/pages/app/WaitOnSchedule.tsx` reads published schedules for active members.
- `src/pages/app/Dashboard.tsx` reads the current week's published schedule for assigned-brother notifications.

### public.wait_on_assignments

Purpose: brother assignments for each weekly wait-on slot.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `schedule_id uuid not null references public.wait_on_schedules(id) on delete cascade`
- `slot_key text not null`
- `brother_id uuid not null references public.profiles(user_id) on delete cascade`
- `created_at timestamptz not null default now()`

Constraints:

- `(schedule_id, slot_key, brother_id)` is unique.
- `slot_key` must be one of: `monday_lunch`, `monday_dinner`, `tuesday_lunch`, `tuesday_dinner`, `wednesday_lunch`, `wednesday_dinner`, `thursday_lunch`, `thursday_dinner`, `friday_lunch`, `saturday_mop`, `sunday_wait_on`.

Frontend usage:

- `src/lib/waitOnQueries.ts` reads and mutates assignments.
- Steward tools show all assignments for manageable schedules.
- Active users can read assignments only when the parent schedule is published.

### public.audit_log

Purpose: audit trail for sensitive/admin actions.

Columns:

- `id bigint primary key default nextval('audit_log_id_seq'::regclass)`
- `actor_id uuid references auth.users(id)`
- `action text not null`
- `target_user_id uuid references auth.users(id)`
- `created_at timestamptz not null default now()`

Frontend usage:

- No current frontend workflow.

## Role Catalog

Current hosted `public.roles` rows plus repo rollout additions:

| Slug | Name |
| --- | --- |
| `admin` | Admin |
| `alum` | Alumni |
| `alumni-chair` | Alumni Chairman |
| `brother` | Brother |
| `chapter-dev` | Chapter Development |
| `cs-chair` | Community Service Chairman |
| `ea` | Eminent Archon |
| `eda` | Eminent Deputy Archon |
| `hm` | House Manager |
| `hsm` | Health & Safety Manager |
| `membered` | Member Educator |
| `neophyte` | Neophyte |
| `philo-chair` | Philanthropy Chairman |
| `preceptor` | Preceptor |
| `professional-dev` | Professional Development |
| `rec` | Recorder |
| `scholarship` | Scholarship Chairman |
| `social-chair` | Social Chairman |
| `stew` | Steward |
| `treasurer` | Treasurer |

Rows marked by this repo rollout (`alumni-chair`, `chapter-dev`, `professional-dev`) may not exist in older hosted exports; `supabase/event_types.sql` inserts them idempotently. Do not infer new permissions from role names alone. Check the permission sections and hosted RLS policies before changing behavior.

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

Important: the 2026-06-25 RLS policy export includes current-user read, insert, and delete policies for `announcement_likes`. Trigger state for keeping `announcements.likes` synchronized remains external/unverified until a fresh function/trigger export is provided.

### Events

Hosted policy snapshot:

- Users can select events if they are `brother`, created the event, or are in a visible audience role.
- `alum` can view events where `visible_to_alum` is true.
- `neophyte` can view events where `visible_to_neophyte` is true.
- Users can insert events they own.
- Event owners or `brother` users can update/delete events.

Frontend currently uses a stricter/higher-level role split for event management:

- Full CRUD roles: `admin`, `ea`, `eda`, `rec`, `recorder`.
- `social-chair`: `party`, `formal`.
- `alumni-chair`: `alumni_event`.
- `chapter-dev`: `brotherhood_event`.
- `cs-chair`: `community_service`.
- `hm`: `work_party`.
- `hsm`: `brotherhood_event`, `party`, `formal`, `hsm_event`.
- `membered`: `new_member_meeting`, `new_member_event`.
- `philo-chair`: `philanthropy`.
- `professional-dev`: `professional_development`.
- `scholarship`: `scholarship`.
- Own-event fallback roles remain for legacy event records where applicable.

The dedicated Party and Formal tool routes are exposed under both `/app/tools/social-chair/*` and `/app/tools/hsm/*`. Both roles read and update the same `events` rows by event type, so Social Chair can edit Party/Formal events created by HSM and HSM can edit Party/Formal events created by Social Chair when hosted RLS includes the matching `can_manage_event_type` behavior.

The dedicated Alumni Event tool route is `/app/tools/alumni-chair/alumni-events`. It creates `alumni_event` rows, forces alumni visibility, and stores the public-facing `location` field in `events.details`. Frontend helpers also treat `alumni_event` rows as alumni-visible by event type.

The dedicated Professional Development tool route is `/app/tools/professional-dev/professional-development-events`. It creates `professional_development` events and stores the optional public-facing `speaker` field in `events.details`.

This is a known area where hosted RLS and frontend role intent should be re-verified before changing event behavior.

### Chair Tools

Frontend visibility:

- Assigned chair roles can access their own `/app/tools/:roleSlug` workspace.
- `treasurer` can access budget workflows through `/app/tools/treasurer`.
- `admin`, `ea`, and `eda` can access every chair workspace through `/app/tools`.

Frontend helper:

- `src/auth/roleAccess.ts`

Expected capabilities:

- Route guards and sidebar visibility should use the same chair-tool helpers.
- All-chair-tools access is separate from budget administration access; do not use Treasurer budget access as a proxy for every dedicated chair tool.

### Wait-ons

Frontend visibility:

- Steward scheduling is available at `/app/tools/stew/wait-ons`.
- `stew`/`steward`, `admin`, `ea`, and `eda` can manage weekly wait-on schedules.
- Active members can view published wait-on forms at `/app/wait-ons`.
- Dashboard notifications appear when the current user has a published assignment in the current Monday-starting week.

Frontend helper:

- `src/auth/roleAccess.ts`

Database helper:

- `public.can_manage_wait_ons(uuid)`

Expected capabilities:

- Managers can create one schedule per `week_start`, add/remove brothers from the allowed slots, and publish/unpublish the form.
- Published schedules and their assignments are readable by active users.
- Draft/unpublished schedules are readable only by wait-on managers.

### Calendars

Hosted policy snapshot currently allows authenticated users to select, insert, update, and delete calendars.

There are multiple duplicate SELECT policies in hosted state. Treat this as external state to clean up deliberately, not as a frontend bug.

### Budgets

Current schema snapshot:

- Active budget workflows use `budget_cycles`, `budget_accounts`, and `budget_transactions`.
- The older `transactions` table remains in the hosted schema export but is not used by current frontend budget workflows.
- No `budgets` table appears in the 2026-06-25 hosted schema export.

Frontend visibility:

- Budget administration is available to `admin`, `ea`, `eda`, and `treasurer`.
- Budget workflows are exposed as separate Treasurer tools under `/app/tools/treasurer`.
- Top-level `/app/budget*` routes are compatibility redirects into `/app/tools/treasurer/*`.
- Budget account detail access is still allowed for users whose roles are budget-account-capable in `src/auth/roleAccess.ts`, but the canonical account path is `/app/tools/treasurer/accounts/:accountId`.

Treasurer tool paths:

- `/app/tools/treasurer/overview`: active-cycle budget overview.
- `/app/tools/treasurer/requests`: submitted expense request approval/denial.
- `/app/tools/treasurer/reimbursements`: approved expense reimbursement marking.
- `/app/tools/treasurer/cycles`: budget cycle creation and active-cycle selection.
- `/app/tools/treasurer/allocations`: active-cycle budget account creation, editing, and deletion.
- `/app/tools/treasurer/accounts/:accountId`: individual budget account transactions and expense submission.

Hosted policy notes:

- The 2026-06-25 RLS policy export verifies the budget table policies listed below.
- The helper function bodies behind `current_user_is_active()`, `is_budget_manager()`, and `can_access_budget_account(uuid)` were not included in the policy export. Ask for hosted function definitions before changing budget access assumptions.

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

### public.can_manage_wait_ons(uuid)

Expected behavior: returns true when the user has one of:

- `admin`
- `ea`
- `eda`
- `president`
- `vice-president`
- `vice_president`
- `vp`
- `stew`
- `steward`

Used by hosted wait-on schedule and assignment policies.

Repo definition:

- `supabase/wait_on_schedules.sql`

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

Expected behavior: trigger helper that creates or completes a pending profile row for a new auth user.

Verified from the 2026-06-30 Supabase plugin migration:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
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
```

Verified trigger attachment:

- `auth.users` AFTER INSERT trigger `on_auth_user_created` executes `handle_new_user()`.
- Direct `anon` and `authenticated` execute privileges are revoked.

### public.sync_profile_email()

Expected behavior: trigger helper that upserts `profiles.email` from auth user email changes and fills missing `profiles.name` from signup metadata when available.

Verified from the 2026-06-30 Supabase plugin migration:

```sql
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
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
```

Verified trigger attachment:

- `auth.users` AFTER INSERT OR UPDATE OF `email` trigger `auth_users_sync_profile_email` executes `sync_profile_email()`.
- Direct `anon` and `authenticated` execute privileges are revoked.

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

### Other Policy Helpers

The 2026-06-25 RLS policy export references these helper functions, but the export did not include their hosted definitions:

- `public.current_user_is_active()`
- `public.is_budget_manager()`
- `public.can_access_budget_account(uuid)`
- `public.can_manage_events(uuid)`
- `public.can_manage_event_type(uuid, text)`

Repo SQL defines or references some event helpers, but hosted function bodies should be verified before changing access behavior that depends on any of these helpers.

## Hosted RLS Policy Snapshot

This section reflects the policy export provided on 2026-06-25.

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

- `Users can read own announcement likes`
  - SELECT to authenticated.
  - Allows rows where `user_id = auth.uid()`.
- `Users can like announcements`
  - INSERT to authenticated.
  - Requires `user_id = auth.uid()`.
- `Users can unlike own announcement likes`
  - DELETE to authenticated.
  - Allows rows where `user_id = auth.uid()`.

Trigger state for keeping `announcements.likes` aligned with `announcement_likes` is not proven by this policy export.

### public.budget_cycles

- `Active users can view budget cycles`
  - SELECT to authenticated.
  - Allows users passing `current_user_is_active()`.
- `Budget managers can manage budget cycles`
  - ALL to authenticated.
  - Allows and checks users passing `is_budget_manager()`.

### public.budget_accounts

- `Users can view accessible budget accounts`
  - SELECT to authenticated.
  - Allows rows passing `can_access_budget_account(id)`.
- `Budget managers can manage budget accounts`
  - ALL to authenticated.
  - Allows and checks users passing `is_budget_manager()`.

### public.budget_transactions

- `Users can view accessible budget transactions`
  - SELECT to authenticated.
  - Allows rows whose `budget_account_id` passes `can_access_budget_account(budget_account_id)`.
- `Users can submit transactions to accessible budgets`
  - INSERT to authenticated.
  - Requires `submitted_by = auth.uid()`, `status = 'submitted'`, and accessible `budget_account_id`.
- `Budget managers can update budget transactions`
  - UPDATE to authenticated.
  - Allows and checks users passing `is_budget_manager()`.
- `Budget managers can delete budget transactions`
  - DELETE to authenticated.
  - Allows users passing `is_budget_manager()`.

### public.wait_on_schedules

Verified from the 2026-06-29 Supabase plugin migration:

- `Wait-on managers can read all schedules`
  - SELECT to authenticated.
  - Allows users passing `can_manage_wait_ons(auth.uid())`.
- `Active users can read published wait-on schedules`
  - SELECT to authenticated.
  - Allows active users to read rows where `published = true`.
- `Wait-on managers can insert schedules`
  - INSERT to authenticated.
  - Requires `created_by = auth.uid()` and wait-on manager access.
- `Wait-on managers can update schedules`
  - UPDATE to authenticated.
  - Allows and checks wait-on manager access.
- `Wait-on managers can delete schedules`
  - DELETE to authenticated.
  - Allows wait-on manager access.

### public.wait_on_assignments

Verified from the 2026-06-29 Supabase plugin migration:

- `Wait-on managers can read all assignments`
  - SELECT to authenticated.
  - Allows users passing `can_manage_wait_ons(auth.uid())`.
- `Active users can read published wait-on assignments`
  - SELECT to authenticated.
  - Allows active users to read assignment rows whose parent schedule is published.
- `Wait-on managers can insert assignments`
  - INSERT to authenticated.
  - Requires wait-on manager access.
- `Wait-on managers can update assignments`
  - UPDATE to authenticated.
  - Allows and checks wait-on manager access.
- `Wait-on managers can delete assignments`
  - DELETE to authenticated.
  - Allows wait-on manager access.

### public.calendars

- `calendars_select_all_authenticated`
- `calendars_select_authenticated`
- `calendars_select_authenticated_only`
- `calendars_insert_authenticated`
- `calendars_update_authenticated`
- `calendars_delete_authenticated`

All current calendar policies allow authenticated users with `true` predicates.

### public.events

- `Event managers can read all events`
  - SELECT to authenticated.
  - Allows users passing `can_manage_events(auth.uid())`.
- `Event managers can insert events`
  - INSERT to authenticated.
  - Requires `created_by = auth.uid()` and `can_manage_events(auth.uid())`.
- `Event managers can update all events`
  - UPDATE to authenticated.
  - Allows and checks users passing `can_manage_events(auth.uid())`.
- `Event managers can delete all events`
  - DELETE to authenticated.
  - Allows users passing `can_manage_events(auth.uid())`.
- `Event type managers can read manageable events`
  - SELECT to authenticated.
  - Allows rows passing `can_manage_event_type(auth.uid(), event_type)`.
- `Event type managers can create manageable events`
  - INSERT to authenticated.
  - Requires `created_by = auth.uid()` and manageable `event_type`.
- `Event type managers can update manageable events`
  - UPDATE to authenticated.
  - Allows and checks manageable `event_type`.
- `Event type managers can delete manageable events`
  - DELETE to authenticated.
  - Allows manageable `event_type`.
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

### public.majors

- `Authenticated users can read majors`
  - SELECT to authenticated using `true`.

### public.profiles

Current hosted policies include both newer member-manager policies and older profile policies:

- `Active users can read active profiles`
  - SELECT to authenticated.
  - Allows rows where the target profile is `active` and the requesting user is active via `is_active(auth.uid())`.
- `Member managers can read all profiles`
  - SELECT to authenticated via `can_manage_members(auth.uid())`.
- `Member managers can update all profiles`
  - UPDATE to authenticated via `can_manage_members(auth.uid())`.
- `Users can insert own profile`
  - INSERT to authenticated where `user_id = auth.uid()`.
- `Users can read own profile`
  - SELECT to authenticated where `user_id = auth.uid()`.
- `profiles_admin_all`
  - ALL to authenticated for users with `admin` in `user_roles`.
- `profiles_delete_own`
  - DELETE to authenticated where `user_id = auth.uid()`.
- `profiles_insert_authenticated`
  - INSERT to authenticated for admins or for own pending profile rows.
- `profiles_select_own`
  - SELECT to authenticated where `user_id = auth.uid()`.
- `profiles_update_own`
  - UPDATE to authenticated where `user_id = auth.uid()`.
- `update_own_profile_while_pending`
  - UPDATE to authenticated where `user_id = auth.uid()` and the row status is `pending`.

This overlap may be intentional or may be cleanup debt. Do not remove policy overlap without confirming desired hosted behavior.

### public.roles

- `Authenticated users can read roles`
  - SELECT to authenticated using `true`.
- `roles_select_for_member`
  - SELECT to authenticated using `is_role_member(slug, auth.uid())`.

### public.user_roles

- `Active users can read active user roles`
  - SELECT to authenticated when both the requesting user and target user are active.
- `Member managers can delete user roles`
  - DELETE to authenticated via `can_manage_members(auth.uid())`.
- `Member managers can insert user roles`
  - INSERT to authenticated via `can_manage_members(auth.uid())`.
- `Member managers can read all user roles`
  - SELECT to authenticated via `can_manage_members(auth.uid())`.
- `Users can read own roles`
  - SELECT to authenticated where `user_id = auth.uid()`.
- `read own roles`
  - SELECT to authenticated where `user_id = auth.uid()`.

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

### supabase/auth_profile_triggers.sql

Purpose:

- Updates the hosted auth trigger functions used by registration.
- Creates pending profile rows from `auth.users` signups with `user_id`, `name`, `email`, and `status`.
- Backfills missing profile names from `auth.users.raw_user_meta_data->>'name'` when available.
- Sets fixed function `search_path` values and revokes direct `anon`/`authenticated` execute on trigger-only functions.

Rollout note:

- Applied to hosted Supabase on 2026-06-30 through migration `fix_signup_profile_metadata`.
- Existing `auth.users` trigger attachments were verified after rollout.

### supabase/announcement_likes.sql

Purpose:

- Creates `announcement_likes` for per-user announcement like state.
- Enables RLS and creates current-user select/insert/delete policies.
- Creates `apply_announcement_like_delta()` and a trigger to keep `announcements.likes` synchronized.
- Notifies PostgREST to reload the schema cache.

Current mismatch:

- The latest hosted schema export shows `announcement_likes` foreign keys without `on delete cascade`; the repo rollout script currently defines cascade behavior for announcement/profile deletion. Verify hosted constraints before relying on automatic cleanup.

### supabase/event_types.sql

Purpose:

- Adds `events.event_type`.
- Adds `events.details`.
- Inserts missing role rows for `alumni-chair`, `chapter-dev`, and `professional-dev`.
- Backfills existing events to `brotherhood_event`.
- Backfills missing event details to `{}`.
- Adds the current allowed event type check constraint, including `hsm_event`.
- Adds a JSON object check constraint for event details.
- Adds `public.can_manage_all_events(uuid)` and `public.can_manage_event_type(uuid, text)`.
- Adds additive event-type manager policies for reading, creating, updating, and deleting manageable events.
- Notifies PostgREST to reload the schema cache.

Current schema note:

- The 2026-06-25 hosted schema export already includes `events.event_type`, `events.details`, and their check constraints.
- Use this file as the repo reconciliation/reference script for environments that do not yet match the canonical hosted schema.
- Existing event manager policies may still allow broader event administration if `supabase/events_management_access_policies.sql` has not been reconciled in the hosted project; verify hosted RLS before relying only on frontend routing.

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
- Adds additive event RLS policies so `admin`, `ea`, `eda`, recorder, and president/vice-president slug variants can read, create, update, and delete events.

Rollout note:

- This file is intended to fix hosted policy gaps where event managers without the `brother` role cannot view or manage calendar events.
- It does not remove existing event visibility or owner policies.

### supabase/wait_on_schedules.sql

Purpose:

- Creates `wait_on_schedules` and `wait_on_assignments`.
- Adds the allowed slot constraint for Monday through Thursday lunch/dinner, Friday lunch, Saturday mop, and Sunday wait-on.
- Adds `public.can_manage_wait_ons(uuid)`.
- Enables RLS, grants authenticated Data API access, and creates manager/published-reader policies.
- Adds an `updated_at` trigger for schedule updates.
- Notifies PostgREST to reload the schema cache.

## Known Drift And Cleanup Items

- Hosted calendar policies include duplicate SELECT policies.
- Hosted profile and user role policies include overlapping legacy and new policies.
- Hosted `announcement_likes` aggregate trigger state is not documented in the latest export.
- Hosted definitions for budget policy helpers (`current_user_is_active`, `is_budget_manager`, `can_access_budget_account`) are not documented in the latest export.
- Repo announcement policies differ from hosted announcement policies.
- Repo `announcement_likes.sql` may differ from hosted foreign-key delete behavior.
- Repo event/calendar policies differ from hosted event/calendar policies.
- No repo SQL file currently documents the hosted `budget_cycles`, `budget_accounts`, and `budget_transactions` setup.
- Trigger attachment for `rls_auto_enable` is not documented yet.

## Future Exports To Add

Ask the user for these before high-risk database work:

- Fresh full schema export.
- Fresh full RLS policy export if policies change after the 2026-06-25 export.
- Trigger definitions/attachments for `announcement_likes_apply_delta` and `rls_auto_enable`.
- Any function definitions not listed in this document.
