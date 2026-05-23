@@ -97,50 +97,189 @@ Protected member routes:
- `/app/announcements/create`
- `/app/announcements/:announcementId/edit`
- `/app/members`: member management UI for `admin`, `ea`, and `eda`
- `/app/account`

Admin routes:
- `/admin`: requires `admin` role
- `/admin/accounts`: account and role management UI
- `/admin/events`: currently placeholder page

## Supabase Data Model (minimum used by current code)

Tables used by the frontend:
- `profiles`: `user_id`, `name`, `email`, `status`, `created_at`
- `roles`: `slug`, `name`
- `user_roles`: `user_id`, `role_slug`
- `announcements`: `id`, `created_at`, `title`, `body`, `author_id`, `visibility`, `likes`

Status values expected by UI:
- `pending`
- `active`
- `suspended`

Role slugs:
- `admin` is used for admin access checks
- `ea` and `eda` are used with `admin` for member-management access

## Supabase Relationship & RLS Working Notes (current snapshot, **not final**)

This section is an **in-progress documentation snapshot** so contributors can stay in the loop with the current hosted/repo Supabase model.

Important expectations:
- This is **not the final implementation** of the database.
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
- Primary key: `user_id` (`uuid`) → `auth.users.id`.
- Key columns: `name`, `status` (`user_status`: `pending` | `active` | `suspended`), `email`, `created_at`.
- Referenced by:
  - `public.user_roles.user_id`
  - `public.announcements.author_id`
  - `public.events.created_by`
  - `public.transactions.created_by`

#### `public.roles`
- Purpose: role catalog for RBAC (for example `admin`, `member`).
- Primary key: `slug` (`text`).
- Key columns: `slug`, `name`.
- Referenced by:
  - `public.user_roles.role_slug`

#### `public.user_roles`
- Purpose: user↔role join table (many-to-many).
- Primary key: (`user_id`, `role_slug`).
- Foreign keys:
  - `user_id` → `public.profiles.user_id`
  - `role_slug` → `public.roles.slug`
- Key columns: `created_at`.

#### `public.audit_log`
- Purpose: append-only audit trail for administrative or sensitive actions.
- Primary key: `id` (`bigint`, identity).
- Foreign keys:
  - `actor_id` → `auth.users.id`
  - `target_user_id` → `auth.users.id`
- Key columns: `action`, `created_at`.

#### `public.announcements`
- Purpose: user-authored announcement feed.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign key: `author_id` → `public.profiles.user_id`.
- Key columns: `title`, `body`, `visibility` (`user_status`), `likes` (`int`, non-negative), `created_at`.

#### `public.events`
- Purpose: scheduled events.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign key: `created_by` → `public.profiles.user_id`.
- Key columns: `title`, `description`, `start`, `end`, `created_at`.

#### `public.budgets`
- Purpose: budget master records.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Key columns: `committee`, `amount`.
- Referenced by:
  - `public.transactions.budget_id`

#### `public.transactions`
- Purpose: budget-linked financial records.
- Primary key: `id` (`uuid`, default `gen_random_uuid()`).
- Foreign keys:
  - `budget_id` → `public.budgets.id`
  - `created_by` → `public.profiles.user_id`
- Key columns: `amount`, `vendor`, `date`.

#### `public.calendars`
- Purpose: date-range blocks (for terms/windows/cycles).
- Primary key: `id` (`bigint`, identity).
- Key columns: `start`, `end`, `name`.

### Relationship summary (foreign keys)

- `profiles.user_id` is referenced by:
  - `user_roles.user_id`
  - `announcements.author_id`
  - `events.created_by`
  - `transactions.created_by`
- `roles.slug` is referenced by:
  - `user_roles.role_slug`
- `budgets.id` is referenced by:
  - `transactions.budget_id`

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
- `supabase/events_calendar_policies.sql`

Important:
- Some live policy/function configuration may exist only in the hosted Supabase project and may not be fully mirrored in this repo.
- Treat this repo as partial policy source-of-truth unless you have verified hosted Supabase state.
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
