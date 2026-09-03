# Project State

This file preserves the detailed internal project snapshot that previously lived in the root `README.md`. Coding agents should read this first for the current route map, data model notes, known placeholders, and rollout caveats.

Related live-user rollout tracking:
- `docs/version-updates.md`: running internal log for real-user issue fixes, production-facing version updates, validation notes, deployment notes, and Supabase rollout caveats from 2026-09-03 onward.

Protected app routes:
- `/app`: dashboard
- `/app/scheduling`: agenda-first chapter calendar with a full calendar display and calendar-window management for permitted officers
- `/app/events/manage`: event management for permitted chapter operators, with event creation routed through per-type tools
- `/app/tools`: chair tool index for assigned chair roles
- `/app/tools/:roleSlug/*`: role-specific chair tool surface
- `/app/tools/social-chair/party-events`, `/app/tools/hsm/party-events`, and `/app/tools/rec/party-events`: party event creator and checklist tool
- `/app/tools/social-chair/formal-events`, `/app/tools/hsm/formal-events`, and `/app/tools/rec/formal-events`: formal event creator, payment calculator, attendee table, and setup checklist tool
- `/app/tools/social-events/sorority-fraternity-events` and `/app/tools/rec/sorority-fraternity-events`: sorority/fraternity event creator
- `/app/tools/dei-chair/dei-events` and `/app/tools/rec/dei-events`: DEI event creator
- `/app/tools/cs-chair/community-service-events` and `/app/tools/rec/community-service-events`: community service event creator, attendance hours table, and Nationals logging tracker
- `/app/tools/philo-chair/philanthropy-events` and `/app/tools/rec/philanthropy-events`: philanthropy event creator
- `/app/tools/hm/house-meetings` and `/app/tools/rec/house-meetings`: house meeting event creator, with Recorder-only attendance tracking
- `/app/tools/alumni-chair/alumni-events` and `/app/tools/rec/alumni-events`: alumni event creator with required public location details
- `/app/tools/rush-chair/rush-events` and `/app/tools/rec/rush-events`: rush event creator
- `/app/tools/scholarship/scholarship-events` and `/app/tools/rec/scholarship-events`: scholarship event creator
- `/app/tools/prof-dev/professional-development-events` and `/app/tools/rec/professional-development-events`: professional development event creator with optional public speaker details
- `/app/tools/chapter-dev/brotherhood-events`, `/app/tools/hsm/brotherhood-events`, and `/app/tools/rec/brotherhood-events`: brotherhood event creator
- `/app/tools/hsm/hsm-events` and `/app/tools/rec/hsm-events`: HSM event creator
- `/app/tools/hm/work-parties` and `/app/tools/rec/work-parties`: work party event creator
- `/app/tools/membered/new-member-meetings` and `/app/tools/rec/new-member-meetings`: new member meeting creator
- `/app/tools/membered/new-member-events` and `/app/tools/rec/new-member-events`: new member event creator
- `/app/tools/rec/other-events`: other event creator
- `/app/tools/treasurer`: Treasurer budget tool index
- `/app/tools/treasurer/overview`: active-cycle budget overview
- `/app/tools/treasurer/requests`: submitted expense request review
- `/app/tools/treasurer/reimbursements`: approved expense reimbursement tracker
- `/app/tools/treasurer/cycles`: budget cycle management
- `/app/tools/treasurer/allocations`: active-cycle budget account allocation management
- `/app/tools/treasurer/accounts/:accountId`: budget account detail, expense submission, and transaction history
- `/app/tools/stew/wait-ons`: Steward weekly wait-on scheduler and publishing tool
- `/app/wait-ons`: published weekly wait-on form for active members
- `/app/manage`: chapter management hub for member status managers and role-assignment managers
- `/app/manage/members`: member approval, role assignment, and status management
- `/app/announcements`: announcement feed
- `/app/announcements/create`
- `/app/announcements/:announcementId/edit`
- `/app/account`
- `/app/system-admin`: future system-admin surface, restricted to `admin`

Legacy compatibility redirects:
- `/admin` -> `/app/manage`
- `/admin/accounts` -> `/app/manage/members`
- `/admin/events` -> `/app/events/manage`
- `/budget` -> `/app/tools/treasurer/overview`
- `/budget/admin` -> `/app/tools/treasurer`
- `/budget/:accountId` -> `/app/tools/treasurer/accounts/:accountId`
- `/app/budget` -> `/app/tools/treasurer/overview`
- `/app/budget/admin` -> `/app/tools/treasurer`
- `/app/budget/:accountId` -> `/app/tools/treasurer/accounts/:accountId`
- `/app/budgets` -> `/app/tools/treasurer/overview`

## Supabase Data Model (minimum used by current code)

For the full database contract, read `docs/database.md`. It tracks the 2026-06-25 hosted export plus later verified hosted RLS updates.

Tables used by the frontend:
- `profiles`: `user_id`, `name`, `email`, `status`, `created_at`
- `roles`: `slug`, `name`
- `user_roles`: `user_id`, `role_slug`
- `announcements`: `id`, `created_at`, `title`, `body`, `author_id`, `visibility`, `likes`, `reply_count`
- `announcement_likes`: `announcement_id`, `user_id`, `created_at`
- `announcement_replies`: `id`, `announcement_id`, `author_id`, `body`, `created_at`
- `events`: `id`, `created_at`, `title`, `description`, `event_type`, `event_tags`, `details`, `start`, `end`, `created_by`, `visible_to_alum`, `visible_to_neophyte`
- `event_attendance`: `id`, `event_id`, `member_id`, `status`, `notes`, `recorded_by`, `recorded_at`, `created_at`, `updated_at`
- `calendars`: `id`, `start`, `end`, `name`
- `majors`: `id`, `major`, `slug`
- `budget_cycles`: `id`, `name`, `start_date`, `end_date`, `is_active`, `created_at`, `created_by`
- `budget_accounts`: `id`, `cycle_id`, `role_slug`, `allocated_amount`, `notes`, `created_at`, `created_by`
- `budget_transactions`: `id`, `budget_account_id`, `submitted_by`, `amount`, `vendor`, `category`, `description`, `transaction_date`, `status`, `receipt_url`, `approved_by`, `approved_at`, `denial_reason`, `created_at`
- `wait_on_schedules`: `id`, `week_start`, `published`, `created_by`, `created_at`, `updated_at`
- `wait_on_assignments`: `id`, `schedule_id`, `slot_key`, `brother_id`, `created_at`
- `emergency_contacts`: `id`, `user_id`, `contact_type`, `name`, `phone`, `email`, `created_at`, `updated_at`

Status values expected by UI:
- `pending`
- `active`
- `suspended`

Role slugs:
- `profiles.status` is the ultimate access gate: `pending` and `suspended` accounts should have no role-based access, even if stale role rows exist
- Future active profiles must have app access through `admin` or a chapter status role (`brother`, `neophyte`, `alum`/`alumni`); member approval/reinstatement should use `public.approve_member(...)` instead of status-only updates
- Normal member removal should use the existing `suspended` status; backend hard-deleting `auth.users` is reserved for destructive test-account cleanup after the hard-delete cascade migration is applied
- `admin` is used for admin access checks and can assign any role, including `admin` and President roles
- `ea`/`president` can assign VP, Recorder, and lower roles, but not `admin` or President roles
- `eda`/`vp`/`vice-president`/`vice_president` can assign Recorder and lower roles, but not `admin`, President, or VP roles
- `rec`/`recorder` can assign lower roles, but not Recorder, VP, President, or `admin`
- `ea` and `eda` are used with `admin` for chapter/member status-management access and all chair tool access through `/app/tools`
- `admin`, `ea`, `eda`, and `rec`/`recorder` can manage all event types
- `admin`, `ea`, `eda`, President/VP role variants, and `rec`/`recorder` can create, update, and delete calendar windows used as schedule filters.
- Announcement creation is allowed for active `admin`, President/VP role variants, and configured chair roles. Authors can update/delete their own announcements; `admin` can update any announcement; `admin` plus President/VP role variants can delete any announcement.
- Event-type chair access is mapped in `src/auth/roleAccess.ts`; the current rollout adds role rows for `alumni-chair`, `chapter-dev`, `dei-chair`, `prof-dev`, `rush-chair`, and `social-events` if missing.
- `treasurer` has a chair tool workspace for separated budget workflows under `/app/tools/treasurer`
- `stew` has a chair tool workspace for weekly wait-on schedules under `/app/tools/stew/wait-ons`
- `alumni-chair` has a chair tool workspace for alumni events under `/app/tools/alumni-chair/alumni-events`
- `prof-dev` has a chair tool workspace for professional development events under `/app/tools/prof-dev/professional-development-events`
- House meeting attendance is recorded under `/app/tools/rec/house-meetings` by active `rec`/`recorder` users only. Required attendance roster is active `brother` and `neophyte` users. Attendance statuses are `present`, `excused`, and `absent`; records remain editable indefinitely.
- Simple event tools reuse `/app/events/manage` with one scoped event type; specialized party, formal, community service, alumni, and professional development tools keep their richer details workflows.
- `social-events` manages `sorority_fraternity`, `dei-chair` manages `dei`, and `rush-chair` manages `rush`.
- `rec` has per-event-type creator tools for every event type instead of a single all-type creator.
- Budget workflows are no longer a top-level sidebar item; they live under Tools and Treasurer tools.
- Budget-account-capable roles are currently a frontend helper list; replace this with an admin-managed source if role budget eligibility needs to change without code edits.
- `other` events are a generic bucket managed by full event managers (`admin`, `ea`, `eda`, and `rec`/`recorder`) through the Recorder event tool.

## Supabase Relationship & RLS Working Notes

This section summarizes the canonical hosted schema export and the latest available RLS working notes. See `docs/database.md` for later verified hosted policy hardening after the 2026-06-25 export. Function bodies and trigger attachments remain external state unless they are verified from a fresh hosted export or repo SQL.

Important expectations:
- If you notice a discrepancy between app behavior, SQL files, and hosted Supabase state, **do not assume** the intended behavior.
- Ask questions, suggest improvements, and call out missing features before implementing changes.
- When RLS/policy changes are needed, include the exact SQL commands in PR notes (or migration files) so rollout is explicit.

### Scope

- All application-specific tables are in `public`.
- RLS is expected to be enabled across all `public.*` tables listed below.
- Auth identities live in `auth.users`; app profile data is in `public.profiles`.

### `public` tables and relationships

#### `public.profiles`
- Purpose: canonical app profile row per authenticated user.
- Primary key: `user_id` (`uuid`) -> `auth.users.id`.
- Key columns: `name`, `status` (`user_status`: `pending` | `active` | `suspended`), `email`, `created_at`.
- Referenced by:
  - `public.user_roles.user_id`
  - `public.announcements.author_id`
  - `public.events.created_by`
  - `public.transactions.created_by`
  - `public.budget_accounts.created_by`
- `public.budget_transactions.submitted_by`
- `public.budget_transactions.approved_by`
- `public.event_attendance.member_id`
- `public.event_attendance.recorded_by`

#### `public.roles`
- Purpose: role catalog for RBAC (for example `admin`, `member`).
- Primary key: `slug` (`text`).
- Key columns: `slug`, `name`.
- Referenced by:
  - `public.user_roles.role_slug`

#### `public.user_roles`
- Purpose: user-role join table (many-to-many).
- Primary key: (`user_id`, `role_slug`).
- Foreign keys:
  - `user_id` -> `public.profiles.user_id`
  - `role_slug` -> `public.roles.slug`
- Key columns: `created_at`.

#### `public.audit_log`
- Purpose: append-only audit trail for administrative or sensitive actions.
- Primary key: `id` (`bigint`, identity).
- Foreign keys:
  - `actor_id` -> `auth.users.id`
  - `target_user_id` -> `auth.users.id`
- Key columns: `action`, `created_at`.

#### `public.announcements`
- Purpose: user-authored announcement feed.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign key: `author_id` -> `public.profiles.user_id`.
- Key columns: `title`, `body`, `visibility` (`user_status`), `likes` (`int`, non-negative), `reply_count` (`int`, non-negative), `created_at`.

#### `public.events`
- Purpose: scheduled events.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign key: `created_by` -> `public.profiles.user_id`.
- Key columns: `title`, `description`, `event_type`, `event_tags`, `details`, `start`, `end`, `created_at`.
- Schema note: `event_type` and `details` are present in the canonical 2026-06-25 hosted schema export. `event_tags` is added by `supabase/migrations/20260810145111_add_event_tags.sql`. `supabase/event_types.sql` remains the repo reconciliation/reference script for environments that do not match.

#### `public.transactions`
- Purpose: legacy budget-linked financial records from the older budget model.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `created_by` -> `public.profiles.user_id`
- Key columns: `amount`, `vendor`, `date`.
- Notes: the 2026-06-25 hosted schema export did not include `public.budgets` or a foreign key from `transactions.budget_id`; current frontend budget workflows use `budget_cycles`, `budget_accounts`, and `budget_transactions`.

#### `public.calendars`
- Purpose: date-range blocks (for terms/windows/cycles).
- Primary key: `id` (`bigint`, identity).
- Key columns: `start`, `end`, `name`.

#### `public.majors`
- Purpose: academic major catalog for profiles.
- Primary key: `id` (`bigint`, identity).
- Key columns: `major`, `slug`.

#### `public.announcement_likes`
- Purpose: per-user announcement like state.
- Primary key: (`announcement_id`, `user_id`).
- Foreign keys:
  - `announcement_id` -> `public.announcements.id`
  - `user_id` -> `public.profiles.user_id`
- Key columns: `created_at`.

#### `public.announcement_replies`
- Purpose: one-level replies on announcement feed items.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `announcement_id` -> `public.announcements.id`
  - `author_id` -> `public.profiles.user_id`
- Key columns: `body`, `created_at`.

#### `public.budget_cycles`
- Purpose: budget periods/cycles.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `created_by` -> `auth.users.id`
- Key columns: `name`, `start_date`, `end_date`, `is_active`, `created_at`.

#### `public.budget_accounts`
- Purpose: role-scoped budget allocations within a cycle.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `cycle_id` -> `public.budget_cycles.id`
  - `role_slug` -> `public.roles.slug`
  - `created_by` -> `public.profiles.user_id`
- Key columns: `allocated_amount`, `notes`, `created_at`.

#### `public.budget_transactions`
- Purpose: expense and reimbursement records for budget accounts.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `budget_account_id` -> `public.budget_accounts.id`
  - `submitted_by` -> `public.profiles.user_id`
  - `approved_by` -> `public.profiles.user_id`
- Key columns: `amount`, `vendor`, `category`, `description`, `transaction_date`, `status`, `receipt_url`, `approved_at`, `denial_reason`, `created_at`.
- Status values: `submitted`, `approved`, `denied`, `reimbursed`.

### Relationship summary (foreign keys)

- `profiles.user_id` is referenced by:
  - `user_roles.user_id`
  - `announcements.author_id`
  - `announcement_likes.user_id`
  - `announcement_replies.author_id`
  - `events.created_by`
  - `transactions.created_by`
  - `budget_accounts.created_by`
  - `budget_transactions.submitted_by`
  - `budget_transactions.approved_by`
- `roles.slug` is referenced by:
  - `user_roles.role_slug`
  - `budget_accounts.role_slug`
- `announcements.id` is referenced by:
  - `announcement_likes.announcement_id`
  - `announcement_replies.announcement_id`
- `budget_cycles.id` is referenced by:
  - `budget_accounts.cycle_id`
- `budget_accounts.id` is referenced by:
  - `budget_transactions.budget_account_id`

### RLS policy workflow expectations

Use this workflow whenever table access behavior changes:
1. Inspect repo SQL first (`supabase/*.sql`, `supabase/**/migrations` if present).
2. Compare against hosted Supabase policies.
3. If hosted state cannot be verified, mark it as **external/unverified state** in the PR.
4. Include exact SQL statements required for rollout.

### RLS SQL starter commands (copy/update as needed)

```sql
-- Enable RLS on a table (if not already enabled)
alter table public.<table_name> enable row level security;

-- Create a SELECT policy template
create policy "<policy_name>"
on public.<table_name>
for select
to authenticated
using (<sql_boolean_condition>);

-- Create an INSERT policy template
create policy "<policy_name>"
on public.<table_name>
for insert
to authenticated
with check (<sql_boolean_condition>);

-- Create an UPDATE policy template
create policy "<policy_name>"
on public.<table_name>
for update
to authenticated
using (<sql_boolean_condition>)
with check (<sql_boolean_condition>);

-- Create a DELETE policy template
create policy "<policy_name>"
on public.<table_name>
for delete
to authenticated
using (<sql_boolean_condition>);
```

## RLS / Policies

Repository policy/function SQL files:
- `supabase/admin_accounts_policies.sql`
- `supabase/announcements_policies.sql`
- `supabase/auth_profile_triggers.sql`
- `supabase/calendars_policies.sql`
- `supabase/events_policies.sql`
- `supabase/event_types.sql`
- `supabase/events_calendar_policies.sql`
- `supabase/events_management_access_policies.sql`
- `supabase/emergency_contacts.sql`
- `supabase/helper_hardening.sql`
- `supabase/profile_status_role_guards.sql`
- `supabase/profiles_policies.sql`
- `supabase/user_roles_policies.sql`

Important:
- The current hosted RLS policy snapshot is documented in `docs/database.md`.
- Some live function/trigger configuration may exist only in the hosted Supabase project and may not be fully mirrored in this repo.
- Treat repo SQL as rollout/reference material unless it has been verified against hosted Supabase state.
- Before rollout, compare repo SQL against target project policies/functions in Supabase.

## Edge Function

Function path:
- `supabase/functions/sync_profile_emails/index.ts`

Purpose:
- Admin-only `POST` endpoint
- Scans auth users and profiles
- Updates `profiles.email` when it differs from `auth.users.email`

Environment requirements:
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Demo Environment Reset

When `VITE_APP_ENV=demo`, the React app calls `POST /api/demo/reset` once per browser session before auth and app data load. The endpoint deletes and reseeds public application tables only. It does not create, update, or delete Supabase Auth users.

Required Vercel environment variables for the demo deployment:
- `VITE_APP_ENV=demo`
- `APP_ENV=demo`
- `DEMO_RESET_ENABLED=true`
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or a server-only Supabase secret key
- `DEMO_AUTH_USERS_JSON`

`DEMO_AUTH_USERS_JSON` must reference Auth users that already exist in the demo Supabase project:

```json
[
  {
    "userId": "00000000-0000-0000-0000-000000000000",
    "name": "Demo Admin",
    "email": "demo-admin@example.com",
    "roles": ["admin", "brother", "treasurer"]
  }
]
```

Use real demo Auth user IDs and emails in Vercel. Keep service-role or secret keys out of browser-exposed `VITE_` variables.
