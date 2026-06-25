Protected app routes:
- `/app`: dashboard
- `/app/scheduling`: chapter calendar
- `/app/events/manage`: event management for permitted chapter operators
- `/app/tools`: chair tool index for assigned chair roles
- `/app/tools/:roleSlug/*`: role-specific chair tool surface
- `/app/tools/social-chair/party-events`: party event creator and checklist tool for `social-chair`
- `/app/tools/social-chair/formal-events`: formal event creator, payment calculator, attendee table, and setup checklist tool for `social-chair`
- `/app/tools/cs-chair/community-service-events`: community service event creator, attendance hours table, and Nationals logging tracker for `cs-chair`
- `/app/manage`: chapter management hub for `admin`, `ea`, and `eda`
- `/app/manage/members`: member approval, role assignment, and status management
- `/app/budget`: budget dashboard
- `/app/budget/admin`: budget administration for `admin`, `ea`, `eda`, and `treasurer`
- `/app/budget/:accountId`: budget account detail
- `/app/announcements`: announcement feed
- `/app/announcements/create`
- `/app/announcements/:announcementId/edit`
- `/app/account`
- `/app/system-admin`: future system-admin surface, restricted to `admin`

Legacy compatibility redirects:
- `/admin` -> `/app/manage`
- `/admin/accounts` -> `/app/manage/members`
- `/admin/events` -> `/app/events/manage`
- `/budget` -> `/app/budget`
- `/budget/admin` -> `/app/budget/admin`
- `/budget/:accountId` -> `/app/budget/:accountId`

## Supabase Data Model (minimum used by current code)

For the full database contract, read `docs/database.md`. The user-provided hosted schema and RLS policy exports from 2026-06-25 are canonical unless the user says they are outdated.

Tables used by the frontend:
- `profiles`: `user_id`, `name`, `email`, `status`, `created_at`
- `roles`: `slug`, `name`
- `user_roles`: `user_id`, `role_slug`
- `announcements`: `id`, `created_at`, `title`, `body`, `author_id`, `visibility`, `likes`
- `announcement_likes`: `announcement_id`, `user_id`, `created_at`
- `events`: `id`, `created_at`, `title`, `description`, `event_type`, `details`, `start`, `end`, `created_by`, `visible_to_alum`, `visible_to_neophyte`
- `calendars`: `id`, `start`, `end`, `name`
- `majors`: `id`, `major`, `slug`
- `budget_cycles`: `id`, `name`, `start_date`, `end_date`, `is_active`, `created_at`, `created_by`
- `budget_accounts`: `id`, `cycle_id`, `role_slug`, `allocated_amount`, `notes`, `created_at`, `created_by`
- `budget_transactions`: `id`, `budget_account_id`, `submitted_by`, `amount`, `vendor`, `category`, `description`, `transaction_date`, `status`, `receipt_url`, `approved_by`, `approved_at`, `denial_reason`, `created_at`

Status values expected by UI:
- `pending`
- `active`
- `suspended`

Role slugs:
- `admin` is used for admin access checks
- `ea` and `eda` are used with `admin` for chapter/member-management access
- `admin`, `ea`, `eda`, and `rec`/`recorder` can manage all event types
- Event-type chair access is mapped in `src/auth/roleAccess.ts`; the current rollout adds role rows for `alumni-chair`, `chapter-dev`, and `professional-dev` if missing.
- `treasurer` is additive for budget administration
- Budget navigation is shown to budget managers or users whose roles are listed as budget-account-capable in `src/auth/roleAccess.ts`.
- Budget-account-capable roles are currently a frontend helper list; replace this with an admin-managed source if role budget eligibility needs to change without code edits.

## Supabase Relationship & RLS Working Notes

This section summarizes the canonical hosted schema export and the latest available RLS working notes. Schema facts and RLS policies from the 2026-06-25 user-provided exports are canonical unless the user says they are outdated. Function bodies and trigger attachments remain external state unless they are verified from a fresh hosted export or repo SQL.

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
- Key columns: `title`, `body`, `visibility` (`user_status`), `likes` (`int`, non-negative), `created_at`.

#### `public.events`
- Purpose: scheduled events.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign key: `created_by` -> `public.profiles.user_id`.
- Key columns: `title`, `description`, `event_type`, `details`, `start`, `end`, `created_at`.
- Schema note: `event_type` and `details` are present in the canonical 2026-06-25 hosted schema export. `supabase/event_types.sql` remains the repo reconciliation/reference script for environments that do not match.

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

Repository policy files:
- `supabase/admin_accounts_policies.sql`
- `supabase/announcements_policies.sql`
- `supabase/event_types.sql`
- `supabase/events_calendar_policies.sql`
- `supabase/events_management_access_policies.sql`

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
