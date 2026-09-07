# Database Contract

Last updated: 2026-09-03

## Source Of Truth

Hosted Supabase is currently the canonical database source of truth. The user-provided hosted schema and RLS policy exports from 2026-06-25 supersede older notes in this repo unless the user says they are outdated. The wait-on scheduler tables and RLS policies were applied and verified through the Supabase plugin on 2026-06-29. The emergency contacts table and RLS policies were applied and verified through the Supabase plugin on 2026-07-28. The announcement policy hardening was applied and verified through the Supabase plugin on 2026-07-28, and the chair-authoring/admin-update announcement policy revision was applied and verified through the Supabase plugin on 2026-07-29. The calendar policy hardening was applied and verified through the Supabase plugin on 2026-07-29. The event policy rebuild was applied and verified through the Supabase plugin on 2026-07-29. The profile policy hardening was applied and verified through the Supabase plugin on 2026-07-29. The user-role assignment policy hardening was applied and verified through the Supabase plugin on 2026-07-29. The active-status role guard was applied and verified through the Supabase plugin on 2026-07-29. The internal helper hardening was applied and verified through the Supabase plugin on 2026-07-29. The DEI/Professional Development role cleanup and alumni chair alias cleanup were applied and verified through the Supabase plugin on 2026-07-30. Announcement replies, the narrowed reply insert grant, and `announcements.reply_count` were applied and verified through the Supabase plugin on 2026-08-10. The `events.event_tags` repo migration was added on 2026-08-10 but has not been verified against hosted Supabase in this repo note. The `other` event-type migration was applied and verified against both production and demo hosted Supabase projects through the Supabase plugin on 2026-08-31. The active app-access role invariant and `public.approve_member(...)` approval RPC were applied and verified against both production and demo hosted Supabase projects through the Supabase plugin on 2026-08-31. The backend-only hard Auth-user delete cascade migration was added on 2026-08-31 for destructive test-account cleanup, but has not been verified against hosted Supabase in this repo note. The house meeting attendance migration was applied and verified against the demo hosted Supabase project only on 2026-09-03; production rollout is staged in `supabase/migrations/20260903011436_add_house_meeting_attendance.sql` but has not been applied to production. Function bodies and trigger attachments outside the verified sections still reflect the latest available export or repo SQL noted in each section, and must be treated as external/unverified state when a fresh hosted export is not available.

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
- Role checks read `public.user_roles`, but frontend role helpers should treat non-`active` profiles as having no effective roles.
- `profiles.status` is the ultimate authorization gate: `pending` and `suspended` accounts must not receive or use role-based permissions.
- When a profile status changes to `pending` or `suspended`, hosted Supabase deletes that user's `public.user_roles` rows.
- New active profiles must have an app-access role: `admin`, `brother`, `neophyte`, `alum`, or `alumni`. Use `public.approve_member(target_user_id, chapter_role_slug, extra_role_slugs)` to approve or reinstate users so the status and first chapter role are written atomically.
- Normal member removal should use the existing `suspended` status. Hard-deleting rows from `auth.users` is a backend-only cleanup path for test accounts and must not be exposed as a frontend member-management action.
- After applying `supabase/migrations/20260831211942_cascade_auth_user_hard_deletes.sql`, hard-deleting a user from `auth.users` is intended to cascade through app-owned profile data and authored/created/approved records. This is deliberately destructive; verify Storage ownership first because Supabase can reject Auth-user deletion when the user owns Storage objects.

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

- `user_id uuid primary key references auth.users(id) on delete cascade`
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
- `announcement_replies.author_id`
- `events.created_by`
- `transactions.created_by`
- `budget_accounts.created_by`
- `budget_transactions.submitted_by`
- `budget_transactions.approved_by`
- `wait_on_schedules.created_by`
- `wait_on_assignments.brother_id`
- `emergency_contacts.user_id`
- `event_attendance.member_id`
- `event_attendance.recorded_by`

Frontend usage:

- `src/auth/useStatus.tsx` reads `status`.
- `src/pages/Register.tsx` inserts pending profiles.
- `src/pages/app/ManageMembers.tsx` reads profiles, updates status for status managers, and edits allowed role assignments.
- `src/pages/app/Announcement.tsx` reads author names.
- `src/pages/app/Account.tsx` loads the signed-in user's profile before rendering emergency contacts.

### public.emergency_contacts

Purpose: user-owned emergency contact records attached to profile rows.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(user_id) on delete cascade`
- `contact_type text not null`
- `name text not null`
- `phone text not null`
- `email text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current repo constraint intent:

- `contact_type` must be one of: `mother`, `father`, `parent`, `guardian`, `sibling`, `spouse`, `partner`, `child`, `grandparent`, `aunt_uncle`, `cousin`, `friend`, `roommate`, `other`.
- `name` and `phone` must not be blank.
- `email` is optional but must not be blank when provided.

Frontend usage:

- `src/pages/app/EmergencyContactsSection.tsx` reads and mutates contacts.
- `src/pages/app/Account.tsx` allows users to CRUD their own contacts.
- `src/pages/app/MemberDirectory.tsx` shows contacts for the selected member only to the owner, emergency-contact readers, or admins.

Hosted status:

- Applied to hosted Supabase on 2026-07-28 through migrations `add_emergency_contacts`, `harden_emergency_contacts_access`, and `consolidate_emergency_contact_policies`.
- Verified hosted state: table exists, RLS is enabled, `anon` does not have SELECT, `authenticated` has Data API CRUD table privileges, and the four consolidated RLS policies are present.

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

- `user_id uuid not null references public.profiles(user_id) on delete cascade`
- `role_slug text not null references public.roles(slug)`
- `created_at timestamptz not null default now()`
- primary key: `(user_id, role_slug)`

Frontend usage:

- `src/auth/useRoles.tsx` reads roles for the current user.
- `src/pages/app/ManageMembers.tsx` reads user roles and edits assignments through scoped insert/delete operations.

### public.announcements

Purpose: announcement feed.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `title text not null`
- `body text`
- `visibility user-defined`
- `author_id uuid not null references public.profiles(user_id) on delete cascade`
- `likes integer default 0 check (likes >= 0)`
- `reply_count integer not null default 0 check (reply_count >= 0)`

Referenced by:

- `announcement_likes.announcement_id`
- `announcement_replies.announcement_id`

Frontend usage:

- `src/pages/app/Announcements.tsx` reads and deletes announcements, reads aggregate reply counts, and lazy-loads one-level replies when opened.
- `src/pages/app/CreateAnnouncement.tsx` inserts announcements.
- `src/pages/app/EditAnnouncement.tsx` updates announcements.
- `src/pages/app/Likes.tsx` reads the aggregate `likes` count and toggles the current user's row in `announcement_likes`.

### public.announcement_likes

Purpose: per-user announcement like state.

Columns:

- `announcement_id uuid not null references public.announcements(id) on delete cascade`
- `user_id uuid not null references public.profiles(user_id) on delete cascade`
- `created_at timestamptz not null default now()`
- primary key: `(announcement_id, user_id)`

Frontend usage:

- `src/pages/app/Announcements.tsx` reads current-user liked announcement IDs.
- `src/pages/app/Likes.tsx` inserts a row to like and deletes the current user's row to unlike.

Important: older hosted schema exports showed some foreign keys without `on delete cascade`. Apply and verify `supabase/migrations/20260831211942_cascade_auth_user_hard_deletes.sql` before relying on Auth-user hard deletion for cleanup.

### public.announcement_replies

Purpose: one-level replies on announcement feed items.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `announcement_id uuid not null references public.announcements(id) on delete cascade`
- `author_id uuid not null references public.profiles(user_id) on delete cascade`
- `body text not null`
- `created_at timestamptz not null default now()`

Constraints and indexes:

- `announcement_replies_body_not_blank` requires nonblank `body`.
- `(announcement_id, created_at desc)` index supports newest-first feed rendering per announcement.
- `author_id` index supports author-owned mutation checks.

Frontend usage:

- `src/pages/app/Announcements.tsx` reads replies for visible announcements, inserts new replies, updates own reply bodies, and deletes own or moderator-removable replies.
- `src/pages/app/Announcement.tsx` renders one-level replies newest-first and provides inline create/edit/delete controls.

Hosted status:

- Added in repo migration `supabase/migrations/20260810135152_add_announcement_replies.sql`.
- Applied and verified against hosted Supabase on 2026-08-10. Client insert access is narrowed to `announcement_id`, `author_id`, and `body` by `supabase/migrations/20260810140607_narrow_announcement_reply_insert_grants.sql`.

### public.events

Purpose: scheduled events.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `title text not null`
- `description text`
- `start timestamp without time zone not null`
- `end timestamp without time zone not null`
- `created_by uuid not null references public.profiles(user_id) on delete cascade`
- `visible_to_alum boolean not null`
- `visible_to_neophyte boolean not null`
- `event_type text not null default 'brotherhood_event'`
- `event_tags text[] not null default '{}'::text[]`
- `details jsonb not null default '{}'::jsonb`

Referenced by:

- `event_attendance.event_id`

Event type constraints:

- The 2026-06-25 hosted schema export allows: `party`, `formal`, `sorority_fraternity`, `dei`, `community_service`, `philanthropy`, `house_meeting`, `alumni_event`, `rush`, `scholarship`, `professional_development`, `brotherhood_event`, `work_party`, `new_member_meeting`, `new_member_event`.
- The current repo rollout adds `hsm_event` and `other`; apply `supabase/event_types.sql` plus `supabase/migrations/20260831010305_add_other_event_type.sql` before creating those event types in environments that still have older constraints.
- `event_tags` must contain only known event type slugs and must include the primary `event_type`. Tags are secondary categorization and calendar filtering metadata; create/update/delete permissions still use the primary `event_type`.
- Any event tagged `alumni_event` must set `visible_to_alum = true`.
- `details` must be a JSON object.
- `supabase/event_types.sql` remains the repo reconciliation/reference script for environments that do not yet have these columns or constraints.

Frontend usage:

- `src/pages/app/Scheduling.tsx` reads events and filters event-type views by `event_tags`.
- `src/pages/app/ManageEvents.tsx` updates and deletes events from `/app/events/manage`; event creation is routed through per-event-type tool pages.
- `src/pages/app/tools/PartyEventsTool.tsx` creates party events and updates party event `details` from the Social Chair and HSM tool pages.
- `src/pages/app/tools/FormalEventsTool.tsx` creates formal events and updates formal event `details` for cost, attendee, payment, and setup checklist state from the Social Chair and HSM tool pages.
- `src/pages/app/tools/CommunityServiceEventsTool.tsx` creates community service events and updates event `details` for organization, location, attendance hours, and Nationals logging state.
- `src/pages/app/tools/AlumniEventsTool.tsx` creates alumni events and stores the required public `location` value in `details`.
- `src/pages/app/tools/ProfessionalDevelopmentEventsTool.tsx` creates professional development events and stores an optional public `speaker` value in `details`.
- `src/pages/app/tools/HouseMeetingsTool.tsx` creates house meeting events and lets Recorder role users record required attendance for active brothers and neophytes.
- `src/pages/app/tools/ChairTools.tsx` routes each event type to a dedicated tool path. Simple event tools reuse `src/pages/app/ManageEvents.tsx` with one scoped event type; specialized tools own their type-specific `details` workflows.

Important: frontend supplies `created_by`. Hosted RLS now requires `created_by = auth.uid()` on insert, and client updates are not granted `created_by` column access.

### public.event_attendance

Purpose: per-member attendance records for house meeting events.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `event_id uuid not null references public.events(id) on delete cascade`
- `member_id uuid not null references public.profiles(user_id) on delete cascade`
- `status text not null`
- `notes text`
- `recorded_by uuid default auth.uid() references public.profiles(user_id) on delete set null`
- `recorded_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- `(event_id, member_id)` is unique.
- `status` must be one of: `present`, `excused`, `absent`.
- `notes` must be null or nonblank.
- `event_id` must point to a `house_meeting` event, enforced by `private.require_house_meeting_attendance_event()`.
- `(member_id)` and `(event_id, status)` indexes support future member balances/fines and current meeting summaries.

Frontend usage:

- `src/pages/app/tools/HouseMeetingsTool.tsx` reads and upserts attendance rows for house meetings.
- Required roster is computed from active profiles with `brother` or `neophyte` role rows.
- Only active `rec`/`recorder` users can read or mutate attendance through RLS. Members do not currently have an own-attendance read policy.

Hosted status:

- Applied and verified against the demo hosted Supabase project on 2026-09-03 through migration `20260903011436_add_house_meeting_attendance`.
- Not applied to production as of 2026-09-03. Production rollout is staged in `supabase/migrations/20260903011436_add_house_meeting_attendance.sql`.

### public.calendars

Purpose: date windows for scheduling filters.

Columns:

- `id bigint generated always as identity primary key`
- `start date`
- `end date`
- `name text`

Frontend usage:

- `src/pages/app/Scheduling.tsx` reads calendar windows and lets calendar managers create, update, and delete them as schedule filters.

### public.transactions

Purpose: legacy budget-linked financial records from the older budget model.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `budget_id uuid not null default gen_random_uuid()`
- `amount double precision not null`
- `vendor text default 'N/A'`
- `date timestamp without time zone default now()`
- `created_by uuid default gen_random_uuid() references public.profiles(user_id) on delete cascade`

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
- `created_by uuid references auth.users(id) on delete cascade`

Referenced by:

- `budget_accounts.cycle_id`

Frontend usage:

- `src/lib/budgetQueries.ts` reads, creates, and marks active budget cycles.
- `src/pages/app/tools/TreasurerBudgetTools.tsx`, `src/pages/budget/BudgetPage.tsx`, and `src/pages/BudgetAdminPage.tsx` read active cycle state for Treasurer budget tools.

### public.budget_accounts

Purpose: role-scoped budget allocations within a cycle.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `cycle_id uuid not null references public.budget_cycles(id) on delete cascade`
- `role_slug text not null references public.roles(slug)`
- `allocated_amount numeric not null default 0 check (allocated_amount >= 0)`
- `notes text`
- `created_at timestamptz not null default now()`
- `created_by uuid references public.profiles(user_id) on delete cascade`

Referenced by:

- `budget_transactions.budget_account_id`

Frontend usage:

- `src/lib/budgetQueries.ts` reads, creates, updates, and deletes budget accounts.
- `src/pages/app/tools/TreasurerBudgetTools.tsx`, `src/pages/budget/BudgetPage.tsx`, `src/pages/budget/BudgetAccountPage.tsx`, `src/pages/BudgetAdminPage.tsx`, and `src/pages/app/tools/ChairTools.tsx` read account allocations.

### public.budget_transactions

Purpose: expense and reimbursement records for budget accounts.

Demo-only update (2026-09-06): `supabase/migrations/20260907003144_add_budget_house_card.sql` adds `is_house_card boolean not null default false` and `budget_transactions_house_card_not_reimbursed`, which rejects `is_house_card = true` with `status = 'reimbursed'`. Applied to and verified on `DEMO: Mass Delta Portal` only; production has not been updated. Existing insert/select/update policies and the absence of table triggers were checked against Demo before rollout; no policy or grant changes were needed. Apply this migration before the corresponding frontend deployment. Production rollout requires explicit approval.

Demo security advisors after rollout reported existing objects/settings outside this change: [RLS tables without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) (`audit_log`, legacy `transactions`), [anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) execution of existing public security-definer helpers, and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No advisor finding referenced the new column or constraint; these unrelated settings were not changed.

Verification: a temporary table copied Demo's actual defaults and constraints; rolled-back SQL checks passed for the personal default, both approval paths, reimbursement queue filtering, combined spending totals, personal reimbursement, and rejection of House Card reimbursement. This does not replace a signed-in browser check. `npm run build` passed (existing large-bundle warning). `npm run lint` reported five pre-existing `react-hooks/set-state-in-effect` errors, independently reproduced from HEAD: `src/pages/BudgetAdminPage.tsx:300`, `src/pages/app/WaitOnSchedule.tsx:45`, `src/pages/app/tools/StewardWaitOnTool.tsx:128`, `src/pages/budget/BudgetAccountPage.tsx:84`, and `src/pages/budget/BudgetPage.tsx:93`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `budget_account_id uuid not null references public.budget_accounts(id) on delete cascade`
- `submitted_by uuid not null references public.profiles(user_id) on delete cascade`
- `amount numeric not null check (amount > 0)`
- `vendor text`
- `category text`
- `description text not null`
- `transaction_date date not null default current_date`
- `status text not null default 'submitted'`
- `receipt_url text`
- `approved_by uuid references public.profiles(user_id) on delete cascade`
- `approved_at timestamptz`
- `denial_reason text`
- `created_at timestamptz not null default now()`

Current hosted constraints from the 2026-06-25 schema export:

- `status` must be one of: `submitted`, `approved`, `denied`, `reimbursed`.

Frontend usage:

- `src/lib/budgetQueries.ts` reads, inserts, approves, denies, and reimburses budget transactions.
- `src/components/budget/SubmitExpenseForm.tsx` inserts submitted transactions.
- Treasurer tools, account detail, admin review, and chair tool views display these records.

Expense-retention follow-up (2026-09-06): approval and reimbursement update existing rows; `denyBudgetTransaction` now deletes only the matching `submitted` row, using an exact count to reject stale requests. `/app/tools/treasurer/history` reads approved/reimbursed expenses across cycles, including House Card expenses, with paginated status queries. No migration or persistent database change was needed. Demo's authenticated DELETE grant, manager-only DELETE policy, SELECT/UPDATE policies, and helper bodies were verified. No denied rows existed in Demo to clean up. Production was not queried or changed for this follow-up.

Demo verification used disposable fixtures and authenticated-role SQL with a full rollback. Both approval paths, personal reimbursement, retained spending/history, submitted-only denial removal, and protection from stale denial clicks passed. The existing `private.is_active` helper sets transaction-local `row_security=off`; the multi-action test restored `row_security=on` before each statement to reproduce independent API requests. That helper was not changed. The retention behavior applies to the expense workflow; the existing privileged demo reset and administrative parent-deletion cascades remain unchanged.

### public.wait_on_schedules

Purpose: weekly wait-on schedule container for Steward assignments.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `week_start date not null unique`
- `published boolean not null default false`
- `created_by uuid references public.profiles(user_id) on delete cascade`
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
- `actor_id uuid references auth.users(id) on delete cascade`
- `action text not null`
- `target_user_id uuid references auth.users(id) on delete cascade`
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
| `dei-chair` | DEI Chairman |
| `ea` | Eminent Archon |
| `eda` | Eminent Deputy Archon |
| `hm` | House Manager |
| `hsm` | Health & Safety Manager |
| `membered` | Member Educator |
| `neophyte` | Neophyte |
| `philo-chair` | Philanthropy Chairman |
| `preceptor` | Preceptor |
| `prof-dev` | Professional Development Chairman |
| `rec` | Recorder |
| `rush-chair` | Rush Chairman |
| `scholarship` | Scholarship Chairman |
| `social-chair` | Social Chairman |
| `social-events` | Social Events Chairman |
| `stew` | Steward |
| `treasurer` | Treasurer |

Rows marked by this repo rollout (`alumni-chair`, `chapter-dev`, `dei-chair`, `prof-dev`, `rush-chair`, `social-events`) may not exist in older hosted exports; `supabase/event_types.sql` inserts them idempotently and removes duplicate chair aliases after migrating references to their canonical role slugs. Do not infer new permissions from role names alone. Check the permission sections and hosted RLS policies before changing behavior.

## Permission Intent

### Member Management

The Manage Members workflow is available at `/app/manage/members`.

Frontend visibility:

- Profile status managers: `admin`, `ea`/`president`, and `eda`/`vp`/`vice-president`/`vice_president`.
- Role assignment managers: `admin`, President, VP, and Recorder role variants.

Frontend helpers:

- `src/auth/roleAccess.ts`

Database helpers:

- `public.can_manage_members(uuid)`
- `public.current_user_can_manage_role_assignment(text)`
- `public.current_user_can_insert_role_assignment(text, uuid)`
- `public.current_user_can_read_role_assignments()`
- `public.remove_roles_for_inactive_profile()`

Expected capabilities:

- Status managers can read all profiles and update profile status for approve, deny, suspend, and reinstate.
- Role assignment managers can read all profiles and user-role rows required by the editor.
- Role assignment managers can insert roles only for users whose `profiles.status = 'active'`.
- Pending and suspended profiles cannot receive new role rows through the authenticated Data API.
- When an account becomes pending or suspended, hosted Supabase removes that user's existing `user_roles` rows.
- `admin` can insert/delete any `user_roles` row, including `admin` and President roles.
- President (`ea`/`president`) can insert/delete VP, Recorder, and lower roles, but cannot grant/remove `admin` or President roles.
- VP (`eda`/`vp`/`vice-president`/`vice_president`) can insert/delete Recorder and lower roles, but cannot grant/remove `admin`, President, or VP roles.
- Recorder (`rec`/`recorder`) can insert/delete lower roles, but cannot grant/remove Recorder, VP, President, or `admin`.
- No other role can insert or delete another user's role assignment.
- Client role changes are insert/delete only; authenticated users do not have direct `UPDATE` on `public.user_roles`.
- Read role catalog.

The legacy `/admin` route redirects to `/app/manage`. `ea`, `eda`, and `rec` should not need the `admin` role to use `/app/manage/members` for their permitted management actions.

### Emergency Contacts

Frontend visibility:

- Users can manage their own contacts from `/app/account`.
- Users can also manage their own contacts when their own profile is selected in `/app/directory`.
- `admin`, `ea`, `eda`, `hsm`, and `health-safety-manager` can read the emergency-contact section for selected directory profiles.
- `admin` can edit and delete contacts for selected directory profiles.

Frontend helper:

- `src/auth/roleAccess.ts`

Database helpers:

- `public.can_read_all_emergency_contacts(uuid)`
- `public.can_manage_all_emergency_contacts(uuid)`

Expected capabilities:

- Authenticated users can read, insert, update, and delete contacts where `emergency_contacts.user_id = auth.uid()`.
- `admin`, `ea`, `eda`, `hsm`, and `health-safety-manager` can read all emergency contact rows.
- `admin` can insert, update, and delete all emergency contact rows.
- Non-admin all-contact readers cannot insert, update, or delete contacts for other users.

Rollout note:

- The current hosted project has the emergency-contact rollout applied and verified.
- For new environments, apply `supabase/emergency_contacts.sql` before using the frontend emergency contact workflow.
- Because Supabase Data API auto-exposure settings can vary by project, verify that `authenticated` has table privileges and RLS is enabled after rollout.

### Announcements

Hosted policy intent after the 2026-07-29 announcement chair-authoring revision:

- Active users can read visible announcements where `visibility = 'active'`.
- Active users with `admin`, President/VP role variants, or configured chair role slugs can insert announcements for themselves.
- Authors can update and delete their own visible announcements.
- `admin` can update all visible announcements.
- `admin`, President, and VP role variants can delete all visible announcements.
- Update policies must include both `USING` and `WITH CHECK`; `USING` controls existing rows and `WITH CHECK` validates the resulting row.
- Clients are granted `UPDATE` only on `title`, `body`, and `visibility`; direct client updates to `author_id`, `likes`, and timestamps are not part of the announcement edit workflow.
- Per-user like state should live in `announcement_likes` with one row per `(announcement_id, user_id)`.
- The aggregate `announcements.likes` count should stay aligned with `announcement_likes`.
- One-level replies should live in `announcement_replies`; active users can reply to visible announcements, authors can update and delete their own replies, and announcement delete managers can delete any reply.
- The aggregate `announcements.reply_count` count should stay aligned with `announcement_replies`.

Repo SQL in `supabase/announcements_policies.sql` is the rollout/reference script for this policy set.

Important: the 2026-06-25 RLS policy export includes current-user read, insert, and delete policies for `announcement_likes`. Trigger state for keeping `announcements.likes` synchronized remains external/unverified until a fresh function/trigger export is provided.

Announcement replies are introduced by `supabase/migrations/20260810135152_add_announcement_replies.sql`; insert grants are narrowed by `supabase/migrations/20260810140607_narrow_announcement_reply_insert_grants.sql`; reply counts are introduced by `supabase/migrations/20260810142147_add_announcement_reply_counts.sql`. All were applied and verified against hosted Supabase on 2026-08-10.

### Events

Hosted policy intent after the 2026-07-29 event policy rebuild:

- Users whose profile status is `active` can read permitted events.
- Active `brother` users can read all events.
- Active `neophyte` users can read events where `visible_to_neophyte` is true.
- Active `alum`/`alumni` users can read `alumni_event` rows and rows where `visible_to_alum` is true.
- Full event managers can read, insert, update, and delete all valid event types.
- Event-type managers can read, insert, update, and delete only rows whose `event_type` is allowed for one of their roles.
- Secondary `event_tags` do not grant create/update/delete authority; they are for calendar categorization and filters.
- Ordinary members cannot insert, update, or delete events by ownership or by `brother` role alone.
- Inserts must set `created_by = auth.uid()` and must pass active status, role/event-type authorization, nonblank title, `end > start`, object `details`, primary-tag inclusion, known tag values, and alumni visibility rules.
- Updates include both `USING` and `WITH CHECK`; `USING` validates the existing row's event type and `WITH CHECK` validates the resulting row's event type and row invariants.
- Client updates are not granted access to `id`, `created_at`, or `created_by`.
- There is no `calendar_id` column on `events`; calendar validity is currently represented by the required `start`/`end` window.

Frontend uses the same role split for event management:

- Full CRUD roles: `admin`, `ea`, `eda`, `rec`, `recorder`.
- `social-chair`: `party`, `formal`.
- `social-events`: `sorority_fraternity`.
- `alumni-chair`: `alumni_event`.
- `chapter-dev`: `brotherhood_event`.
- `cs-chair`: `community_service`.
- `dei-chair`: `dei`.
- `hm`: `house_meeting`, `work_party`.
- `hsm`: `brotherhood_event`, `party`, `formal`, `hsm_event`.
- `membered`: `new_member_meeting`, `new_member_event`.
- `philo-chair`: `philanthropy`.
- `prof-dev`: `professional_development`.
- `rush-chair`: `rush`.
- `scholarship`: `scholarship`.
- `other` has no chair-specific manager role; only full event managers can manage it.

The dedicated Party and Formal tool routes are exposed under both `/app/tools/social-chair/*` and `/app/tools/hsm/*`. Both roles read and update the same `events` rows by event type, so Social Chair can edit Party/Formal events created by HSM and HSM can edit Party/Formal events created by Social Chair when hosted RLS includes the matching `can_manage_event_type` behavior.

The dedicated Alumni Event tool route is `/app/tools/alumni-chair/alumni-events`. It creates `alumni_event` rows, forces alumni visibility, and stores the public-facing `location` field in `events.details`. Frontend helpers also treat `alumni_event` rows as alumni-visible by event type.

The dedicated Professional Development tool route is `/app/tools/prof-dev/professional-development-events`. It creates `professional_development` events and stores the optional public-facing `speaker` field in `events.details`.

Every event type now has an event creation tool route. Simple event tools reuse the general event manager with a single fixed event type:

- `/app/tools/social-events/sorority-fraternity-events`: `sorority_fraternity`.
- `/app/tools/dei-chair/dei-events`: `dei`.
- `/app/tools/chapter-dev/brotherhood-events`: `brotherhood_event`.
- `/app/tools/hsm/hsm-events`: `hsm_event`.
- `/app/tools/philo-chair/philanthropy-events`: `philanthropy`.
- `/app/tools/scholarship/scholarship-events`: `scholarship`.
- `/app/tools/membered/new-member-meetings`: `new_member_meeting`.
- `/app/tools/membered/new-member-events`: `new_member_event`.
- `/app/tools/hm/house-meetings`: `house_meeting`.
- `/app/tools/hm/work-parties`: `work_party`.
- `/app/tools/rush-chair/rush-events`: `rush`.
- `/app/tools/rec/other-events`: `other`.
- `/app/tools/rec/<event-tool-path>`: Recorder per-event-type creator routes for all event types.

The old permissive `events_insert_own`, `events_update_allowed`, and `events_delete_allowed` policies were removed because permissive RLS policies are OR'd together and those legacy policies undermined the scoped role policies.

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

Hosted policy intent after the 2026-07-29 calendar hardening:

- Users whose profile status is `active` can read calendar windows.
- Users whose profile status is `active` and who hold `admin`, `ea`, `eda`, President, VP, or Recorder role variants can insert, update, and delete calendar windows.
- All other authenticated users have no calendar write access.
- Anonymous users have no direct calendar table or sequence access.
- Clients are granted `INSERT` and `UPDATE` only on `start`, `end`, and `name`; direct client writes to `id` are not granted.

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
- The helper function bodies behind `is_budget_manager()` and `can_access_budget_account(uuid)` were not included in the policy export. Ask for hosted function definitions before changing budget access assumptions.

## Helper Functions

### public.is_admin(uuid)

Expected behavior: returns true when the user has `user_roles.role_slug = 'admin'`.

Hosted definition now checks both `public.is_active(check_user_id)` and the `admin` role row.

Known dependencies:

- Some repo SQL uses this for admin-only announcement update/delete policies.
- Hosted policy snapshot provided here does not show current announcement policies using `is_admin`, but older repo SQL does.

### public.can_manage_members(uuid)

Expected behavior: returns true when the user is active and has one of:

- `admin`
- `ea`
- `eda`
- `president`
- `vice-president`
- `vice_president`
- `vp`

Used by hosted profile status policies for Manage Members.

Hosted definition now checks both `public.is_active(check_user_id)` and the allowed member-manager role rows.

### public.current_user_can_manage_role_assignment(text)

Expected behavior: returns true for the current authenticated user only when their active profile and assigned roles allow them to insert/delete the target role slug:

- `admin`: any role.
- President (`ea`/`president`): VP, Recorder, and lower roles only.
- VP (`eda`/`vp`/`vice-president`/`vice_president`): Recorder and lower roles only.
- Recorder (`rec`/`recorder`): lower roles only.
- Any other role: no role assignment authority.

Used by hosted `user_roles` DELETE policy and by role-assignment read helpers.

### public.current_user_can_insert_role_assignment(text, uuid)

Expected behavior: returns true when the current authenticated user can manage the target role slug and the target profile status is `active`.

Used by hosted `user_roles` INSERT policy so roles cannot be assigned to pending or suspended accounts.

### public.current_user_can_read_role_assignments()

Expected behavior: returns true when `current_user_can_manage_role_assignment('brother')` is true.

Used by hosted profile and user-role SELECT policies so role assignment managers can load the Manage Members editor.

### public.can_manage_wait_ons(uuid)

Expected behavior: returns true when the user is active and has one of:

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

### public.can_read_all_emergency_contacts(uuid)

Expected behavior: returns true when the user is active and has one of:

- `admin`
- `ea`
- `eda`
- `hsm`
- `health-safety-manager`

Repo definition:

- `supabase/emergency_contacts.sql`

Hosted status:

- Applied and verified on hosted Supabase on 2026-07-28.

### public.can_manage_all_emergency_contacts(uuid)

Expected behavior: returns true when the user is active and has the `admin` role.

Repo definition:

- `supabase/emergency_contacts.sql`

Hosted status:

- Applied and verified on hosted Supabase on 2026-07-28.

### public.is_role_member(text, uuid)

Hosted event and role policies reference `is_role_member(role_slug, user_id)`.

Expected behavior: returns true when the given user is active and has the given role slug in `public.user_roles`.

Hosted definition now checks `public.is_active(p_user_id)` before accepting the role row.

### public.is_active(uuid)

Expected behavior: returns true when the user's profile status is `active`.

Hosted definition returns true only when the supplied user ID has a profile row with `status = 'active'`.

### public.increment_announcement_likes(uuid)

Removed from hosted Supabase on 2026-07-29 by `harden_internal_helper_functions`. Current frontend behavior uses per-user rows in `announcement_likes` so users can unlike and liked state can persist across reloads.

### private.apply_announcement_like_delta()

Expected behavior: trigger helper that increments `announcements.likes` after an `announcement_likes` insert and decrements it after an `announcement_likes` delete.

Repo definition:

- `supabase/helper_hardening.sql`

Hosted status:

- Applied and verified on hosted Supabase on 2026-07-29.
- Trigger `announcement_likes_apply_delta` executes `private.apply_announcement_like_delta()`.
- Direct `anon`, `authenticated`, and `public` execute privileges are not granted.

### private.apply_announcement_reply_delta()

Expected behavior: trigger helper that increments `announcements.reply_count` after an `announcement_replies` insert and decrements it after an `announcement_replies` delete.

Repo definition:

- `supabase/migrations/20260810142147_add_announcement_reply_counts.sql`

Hosted status:

- Applied and verified on hosted Supabase on 2026-08-10.
- Trigger `announcement_replies_apply_delta` executes `private.apply_announcement_reply_delta()`.
- Direct `anon`, `authenticated`, and `public` execute privileges are not granted.

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

Verified hosted status after the 2026-07-29 helper hardening:

- Event trigger `ensure_rls` executes `public.rls_auto_enable()`.
- Direct `anon`, `authenticated`, and `public` execute privileges are revoked.

### Other Event Helpers

Older repo SQL included event helper functions such as `has_role`, `can_full_crud_events`, `can_create_owned_events`, `can_manage_events`, `can_manage_all_events`, and `can_manage_event_type`.

After the 2026-07-29 event policy rebuild, hosted event RLS no longer depends on public event helper RPC functions. The old public `can_manage_events`, `can_manage_all_events`, and `can_manage_event_type` functions were removed during the 2026-07-29 helper hardening.

### Other Policy Helpers

Hosted RLS now uses `private.*` policy helpers for active status, role assignment, budget access, wait-on access, emergency-contact access, and profile-status triggers. Legacy `public.*` helper functions may still exist for historical compatibility, but direct `anon`, `authenticated`, and `public` execute privileges are revoked.

## Hosted RLS Policy Snapshot

This section started from the policy export provided on 2026-06-25 and includes later hosted policy updates marked by date.

### public.announcements

- `Active users can read visible announcements`
  - SELECT to authenticated.
  - Allows users whose profile status is `active` to read rows where `visibility = 'active'`.
- `Permitted roles can insert announcements`
  - INSERT to authenticated.
  - Requires active profile status, `author_id = auth.uid()`, `visibility = 'active'`, and one of `admin`, President/VP role variants, or configured chair role slugs.
- `Authors and admins can update announcements`
  - UPDATE to authenticated.
  - Allows active authors to update their own active-visible announcements.
  - Allows active `admin` users to update any active-visible announcement.
  - Includes both `USING` and `WITH CHECK`.
- `Authors and announcement managers can delete announcements`
  - DELETE to authenticated.
  - Allows active authors to delete their own announcements.
  - Allows active `admin`, President, and VP role variants to delete announcements.

Note: the old direct `announcements.likes` update policy was removed. Current frontend code inserts/deletes rows in `announcement_likes`.

### public.announcement_likes

- `Users can read own announcement likes`
  - SELECT to authenticated.
  - Allows rows where `user_id = auth.uid()` and the current profile is active.
- `Users can like announcements`
  - INSERT to authenticated.
  - Requires `user_id = auth.uid()`, an active current profile, and an active-visible announcement.
- `Users can unlike own announcement likes`
  - DELETE to authenticated.
  - Allows rows where `user_id = auth.uid()` and the current profile is active.

Hosted trigger state was verified on 2026-07-29: `announcement_likes_apply_delta` executes `private.apply_announcement_like_delta()`.

### public.announcement_replies

- `Active users can read announcement replies`
  - SELECT to authenticated.
  - Allows active users to read replies whose parent announcement is active-visible.
- `Active users can reply to announcements`
  - INSERT to authenticated.
  - Requires `author_id = auth.uid()`, an active current profile, a nonblank reply body, and an active-visible parent announcement.
- `Authors can update own announcement replies`
  - UPDATE to authenticated.
  - Allows active authors to update their own replies on active-visible announcements.
  - Includes both `USING` and `WITH CHECK`.
  - Clients are granted `UPDATE` only on `body`.
- `Authors and announcement managers can delete replies`
  - DELETE to authenticated.
  - Allows active authors to delete their own replies.
  - Allows active `admin`, President, and VP role variants to delete replies.

Hosted status: applied and verified against hosted Supabase on 2026-08-10.

### public.budget_cycles

- `Active users can view budget cycles`
  - SELECT to authenticated.
  - Allows users passing `private.current_user_is_active()`.
- `Budget managers can manage budget cycles`
  - ALL to authenticated.
  - Allows and checks users passing `private.is_budget_manager()`.

### public.budget_accounts

- `Users can view accessible budget accounts`
  - SELECT to authenticated.
  - Allows rows passing `private.can_access_budget_account(id)`.
- `Budget managers can manage budget accounts`
  - ALL to authenticated.
  - Allows and checks users passing `private.is_budget_manager()`.

### public.budget_transactions

- `Users can view accessible budget transactions`
  - SELECT to authenticated.
  - Allows rows whose `budget_account_id` passes `private.can_access_budget_account(budget_account_id)`.
- `Users can submit transactions to accessible budgets`
  - INSERT to authenticated.
  - Requires `submitted_by = auth.uid()`, `status = 'submitted'`, and `private.can_access_budget_account(budget_account_id)`.
- `Budget managers can update budget transactions`
  - UPDATE to authenticated.
  - Allows and checks users passing `private.is_budget_manager()`.
- `Budget managers can delete budget transactions`
  - DELETE to authenticated.
  - Allows users passing `private.is_budget_manager()`.

### public.wait_on_schedules

Verified from the 2026-06-29 Supabase plugin migration:

- `Wait-on managers can read all schedules`
  - SELECT to authenticated.
  - Allows users passing `private.can_manage_wait_ons(auth.uid())`.
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
  - Allows users passing `private.can_manage_wait_ons(auth.uid())`.
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

- `Active users can read calendars`
  - SELECT to authenticated.
  - Allows users whose profile status is `active` to read calendar windows.
- `Calendar managers can insert calendars`
  - INSERT to authenticated.
  - Requires active profile status and one of `admin`, `ea`, `eda`, `president`, `vice-president`, `vice_president`, `vp`, `rec`, or `recorder`.
- `Calendar managers can update calendars`
  - UPDATE to authenticated.
  - Allows active calendar managers to update calendar windows.
  - Includes both `USING` and `WITH CHECK`.
- `Calendar managers can delete calendars`
  - DELETE to authenticated.
  - Allows active calendar managers to delete calendar windows.

### public.events

- `Active users can read permitted events`
  - SELECT to authenticated.
  - Allows active full managers and active event-type managers to read rows they can manage.
  - Allows active `brother` users to read all events.
  - Allows active `neophyte` users to read neophyte-visible events.
  - Allows active `alum`/`alumni` users to read alumni-visible events and `alumni_event` rows.
- `Approved event roles can insert events`
  - INSERT to authenticated.
  - Requires active profile status, `created_by = auth.uid()`, allowed `event_type`, nonblank `title`, `end > start`, object `details`, and `visible_to_alum = true` for `alumni_event`.
- `Event managers can update allowed events`
  - UPDATE to authenticated.
  - Allows active full managers or active event-type managers to update existing rows whose current `event_type` they can manage.
  - Includes `WITH CHECK` so the resulting row still has an allowed `event_type`, nonblank `title`, `end > start`, object `details`, and valid alumni visibility.
- `Event managers can delete allowed events`
  - DELETE to authenticated.
  - Allows active full managers or active event-type managers to delete rows whose current `event_type` they can manage.

### public.event_attendance

- `Recorders can read house meeting attendance`
  - SELECT to authenticated.
  - Allows active `rec`/`recorder` users to read attendance rows for `house_meeting` events.
- `Recorders can insert house meeting attendance`
  - INSERT to authenticated.
  - Requires active `rec`/`recorder` status, `recorded_by = auth.uid()`, a `house_meeting` event, and an active `brother` or `neophyte` target member.
- `Recorders can update house meeting attendance`
  - UPDATE to authenticated.
  - Allows active `rec`/`recorder` users to update house meeting attendance rows indefinitely.
  - Includes `WITH CHECK` so the resulting row still targets a house meeting, an active required member, and the current Recorder account as `recorded_by`.
- No DELETE policy is defined for authenticated clients.

### public.majors

- `Authenticated users can read majors`
  - SELECT to authenticated using `true`.

### public.profiles

Hosted policy intent after the 2026-07-29 profile hardening:

- `Active users can read active profiles`
  - SELECT to authenticated.
  - Allows rows where the target profile is `active` and the requesting user is active via `private.is_active(auth.uid())`.
- `Member managers can read all profiles`
  - SELECT to authenticated for active `admin`, `ea`, or `eda` users via `private.can_manage_members(auth.uid())`.
- `Role assignment managers can read all profiles`
  - SELECT to authenticated for active role assignment managers via `private.current_user_can_read_role_assignments()`.
  - Exists so President, VP, and Recorder role managers can load the member editor without broad profile-update rights.
- `Member managers can update profiles`
  - UPDATE to authenticated for active `admin`, `ea`, or `eda` users.
  - Includes both `USING` and `WITH CHECK`.
- `Users can insert own pending profile`
  - INSERT to authenticated where `user_id = auth.uid()` and `status = 'pending'`.
- `Users can read own profile`
  - SELECT to authenticated where `user_id = auth.uid()`.
- `Users can update own profile details`
  - UPDATE to authenticated where `user_id = auth.uid()`.
  - Includes both `USING` and `WITH CHECK`.

Grant and trigger notes:

- `anon` has no `profiles` table privileges.
- `authenticated` has SELECT and limited INSERT/UPDATE column privileges only.
- `authenticated` does not have UPDATE privilege on `profiles.user_id`, `profiles.email`, or `profiles.created_at`.
- `authenticated` has UPDATE privilege on `profiles.status` so active member managers can use direct PostgREST status updates.
- The `prevent_profile_self_privilege_escalation` trigger executes `private.prevent_profile_self_privilege_escalation()` and blocks non-member-managers from changing `profiles.status` or `profiles.user_id`, including self-escalation from `pending` to `active`.
- The `remove_roles_for_inactive_profile` trigger executes `private.remove_roles_for_inactive_profile()` and deletes all `user_roles` rows for a profile when `status` changes to `pending` or `suspended`.
- Delete permissions are intentionally absent for `authenticated`; profile deletion is not a current frontend workflow. Hard deletion is done backend-side by deleting the target row from `auth.users` after applying the hard-delete cascade migration.

### public.roles

- `Authenticated users can read roles`
  - SELECT to authenticated using `true`.

### public.user_roles

Hosted policy intent after the 2026-07-29 user-role assignment hardening:

- `Active users can read active user roles`
  - SELECT to authenticated when both the requesting user and target user are active.
- `Role assignment managers can read all user roles`
  - SELECT to authenticated via `private.current_user_can_read_role_assignments()`.
- `Role assignment managers can insert allowed user roles`
  - INSERT to authenticated with `private.current_user_can_insert_role_assignment(role_slug, user_id)`.
  - Requires the target profile to be `active`.
- `Role assignment managers can delete allowed user roles`
  - DELETE to authenticated using `private.current_user_can_manage_role_assignment(role_slug)`.
- `Users can read own roles`
  - SELECT to authenticated where `user_id = auth.uid()` and the requesting user is active.

Grant notes:

- `anon` has no `user_roles` table or column privileges.
- `authenticated` has table-level SELECT and DELETE so RLS can evaluate reads/deletes.
- `authenticated` has INSERT only on `user_id` and `role_slug`; `created_at` is database-generated.
- `authenticated` has no direct UPDATE, TRUNCATE, REFERENCES, or TRIGGER privilege on `user_roles`.
- Pending/suspended users cannot read stale own-role rows through RLS.

## Repo SQL Files

### supabase/admin_accounts_policies.sql

Purpose:

- Defines `is_admin`.
- Defines `can_manage_members`.
- Enables RLS on profiles, roles, and user_roles.
- Creates member-management policies.

Warning:

- Current file drops helper functions with `cascade`. If run, verify dependent policies afterwards.
- This file is superseded for hosted profile and user-role RLS by `supabase/profiles_policies.sql` and `supabase/user_roles_policies.sql`.

### supabase/profile_status_role_guards.sql

Purpose:

- Makes `profiles.status = 'active'` the required gate for role-based helper functions.
- Updates older helper functions so stale `user_roles` rows do not grant permissions to pending or suspended accounts.
- Adds `current_user_can_insert_role_assignment(text, uuid)` so `user_roles` INSERT requires an active target profile.
- Adds `remove_roles_for_inactive_profile()` so moving a profile to `pending` or `suspended` removes all role assignments.
- Tightens the own-role SELECT policy so inactive users cannot read stale own-role rows through RLS.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29 through migrations `enforce_active_status_for_role_permissions` and `require_active_status_for_own_role_reads`.

### supabase/user_roles_policies.sql

Purpose:

- Enables and consolidates RLS on `user_roles`.
- Revokes broad anonymous and authenticated table privileges.
- Grants authenticated users read/delete table privileges and insert privileges only for `user_id` and `role_slug`.
- Adds `current_user_can_manage_role_assignment(text)`, `current_user_can_insert_role_assignment(text, uuid)`, and `current_user_can_read_role_assignments()`.
- Replaces broad member-manager insert/delete policies with role-hierarchy-scoped insert/delete policies.
- Adds a profile read policy for role assignment managers without granting additional profile update access.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29. Production and demo policies/grants for frontend calendar-window CRUD were rechecked through the Supabase plugin on 2026-08-31.

### supabase/announcements_policies.sql

Purpose:

- Enables RLS on announcements.
- Creates announcement read/insert/update/delete policies.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-28, then revised and verified on 2026-07-29.
- Replaces the stale broad authenticated read/insert/update policies with active visible read, chair/officer/admin own-author insert, author-or-admin update, and author-or-officer/admin delete policies.

### supabase/profiles_policies.sql

Purpose:

- Enables and consolidates RLS on profiles.
- Removes broad legacy self-update, self-delete, and admin-all profile policies.
- Revokes anonymous profile table privileges and narrows authenticated grants to required columns.
- Allows own pending inserts, own profile-detail updates, active-user reads of active profiles, and active member-manager reads/status updates.
- Adds `prevent_profile_self_privilege_escalation()` to block non-member-managers from changing `profiles.status` or `profiles.user_id`.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29.

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

- The hosted project was later hardened by `supabase/helper_hardening.sql`, which moves the aggregate trigger helper to `private.apply_announcement_like_delta()` and requires active status for like reads/inserts/deletes.

### supabase/migrations/20260810135152_add_announcement_replies.sql

Purpose:

- Creates `announcement_replies` for one-level announcement replies.
- Enables RLS, grants authenticated Data API access, and revokes anonymous/public table privileges.
- Adds active-user read/insert, author update/delete, and announcement-manager delete policies.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against hosted Supabase on 2026-08-10.

### supabase/migrations/20260810140607_narrow_announcement_reply_insert_grants.sql

Purpose:

- Narrows `authenticated` INSERT privileges on `announcement_replies` to `announcement_id`, `author_id`, and `body`.
- Leaves `id` and `created_at` database-generated for client writes.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against hosted Supabase on 2026-08-10.

### supabase/migrations/20260810142147_add_announcement_reply_counts.sql

Purpose:

- Adds `announcements.reply_count` with a non-negative constraint.
- Backfills `reply_count` from existing `announcement_replies`.
- Creates `private.apply_announcement_reply_delta()` and the `announcement_replies_apply_delta` trigger to keep the aggregate count synchronized.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against hosted Supabase on 2026-08-10.

### supabase/helper_hardening.sql

Purpose:

- Creates the non-exposed `private` schema for policy helper functions.
- Rebuilds helper-dependent RLS policies to call `private.*` helpers instead of public RPC helpers.
- Moves trigger-only helpers for announcement likes, profile status guards, emergency-contact timestamps, and wait-on timestamps into `private`.
- Revokes direct `anon`, `authenticated`, and `public` execute privileges from legacy public helper functions.
- Drops stale public event helper functions and the old `increment_announcement_likes(uuid)` RPC.
- Cleans broad `anon`/overbroad table grants from helper-adjacent tables.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29 through migration `harden_internal_helper_functions`.

### supabase/calendars_policies.sql

Purpose:

- Enables RLS on calendars.
- Revokes broad anonymous and authenticated table privileges.
- Grants authenticated users calendar read access and grants write operation privileges only so RLS can enforce role-based writes.
- Creates active-user SELECT plus manager-only INSERT, UPDATE, and DELETE calendar policies.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29.

### supabase/events_policies.sql

Purpose:

- Enables and consolidates RLS on events.
- Removes broad legacy event policies and old additive event-manager policies.
- Revokes anonymous event table access and narrows authenticated grants.
- Creates one SELECT, INSERT, UPDATE, and DELETE policy for the current event authorization model.
- Drops the unsafe `created_by` default, makes `created_by` and `end` required, and adds row validity constraints for title, event timing, tags, and alumni-event visibility.
- Revokes direct client execute privileges on the old event helper functions, because the consolidated policies no longer depend on those public RPC helpers.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-29.

### supabase/event_types.sql

Purpose:

- Adds `events.event_type`.
- Adds `events.details`.
- Adds `events.event_tags`.
- Inserts missing role rows for `alumni-chair`, `chapter-dev`, `dei-chair`, `prof-dev`, `rush-chair`, and `social-events`, removes duplicate alumni-chair aliases after migrating references to `alumni-chair`, and removes the duplicate `professional-dev` role after migrating references to `prof-dev`.
- Backfills existing events to `brotherhood_event`.
- Backfills missing event details to `{}`.
- Backfills missing event tags from the primary event type.
- Adds the current allowed event type check constraint, including `hsm_event` and `other`.
- Adds event tag constraints requiring known values, primary-tag inclusion, and alumni visibility for alumni-tagged rows.
- Adds a JSON object check constraint for event details.
- Grants authenticated clients INSERT/UPDATE access to `event_tags`.
- Notifies PostgREST to reload the schema cache.

Current schema note:

- The 2026-06-25 hosted schema export already includes `events.event_type`, `events.details`, and their check constraints.
- Use this file as the repo reconciliation/reference script for environments that do not yet match the canonical hosted schema.
- Event RLS now lives in `supabase/events_policies.sql`; do not add event policies in this file.

### supabase/migrations/20260810145111_add_event_tags.sql

Purpose:

- Adds `events.event_tags` as a text-array secondary categorization field.
- Backfills each event to include its primary `event_type`.
- Adds a GIN index for tag filters.
- Grants authenticated clients INSERT/UPDATE access to `event_tags`.
- Adds constraints for known tag values, primary-tag inclusion, and alumni visibility for alumni-tagged rows.

Hosted status:

- Not yet verified against hosted Supabase from this repo note.

### supabase/migrations/20260831010305_add_other_event_type.sql

Purpose:

- Adds `other` to the `events.event_type` allowed-value constraint.
- Adds `other` to the `events.event_tags` known-tag constraint.
- Leaves event RLS role authorization unchanged, so only full event managers can create, update, or delete `other` events.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against both production and demo hosted Supabase projects on 2026-08-31.

### supabase/migrations/20260831152236_require_app_access_role_on_activation.sql

Purpose:

- Adds `private.profile_has_app_access_role(uuid)`.
- Adds deferred trigger guards on `profiles` and `user_roles` so future active profiles cannot be committed without `admin`, `brother`, `neophyte`, `alum`, or `alumni`.
- Adds the first version of `public.approve_member(...)` for atomic approval.
- Does not backfill or scan existing active profiles.

Hosted status:

- Applied against both production and demo hosted Supabase projects on 2026-08-31.

### supabase/migrations/20260831153603_make_approve_member_security_definer.sql

Purpose:

- Replaces `public.approve_member(...)` as a pinned-search-path `security definer` function.
- Explicitly checks that the caller is an active member manager and can assign the requested roles before performing owner-level status and role writes.
- Keeps authenticated execute access and no anon/public execute access.

Hosted status:

- Applied and verified against both production and demo hosted Supabase projects on 2026-08-31.

### supabase/migrations/20260831211942_cascade_auth_user_hard_deletes.sql

Purpose:

- Recreates user-related foreign keys so backend hard-deleting a row from `auth.users` cascades through `profiles` and dependent app rows.
- Covers profile-owned data, authored announcements/replies/likes, created events, legacy transactions, budget cycles/accounts/transactions, wait-on schedules/assignments, emergency contacts, and audit rows.
- Exists for destructive test-account cleanup only. Normal member removal should remain `profiles.status = 'suspended'`.
- Does not grant frontend delete permissions or add any member-management UI.

Hosted status:

- Not yet verified against hosted Supabase from this repo note.

### supabase/migrations/20260903011436_add_house_meeting_attendance.sql

Purpose:

- Creates `event_attendance` for Recorder-managed house meeting attendance.
- Adds unique per-event/per-member rows, status and notes constraints, event/member indexes, and private trigger helpers for `updated_at` and house-meeting-only event enforcement.
- Enables RLS, revokes anonymous/default access, and grants authenticated clients only the select/insert/update privileges needed by the frontend.
- Adds Recorder-only SELECT, INSERT, and UPDATE policies; no member self-read policy and no client DELETE policy are included.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against demo hosted Supabase on 2026-09-03.
- Not applied to production as of 2026-09-03. Apply this migration to production only after explicit greenlight.

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

- Superseded pointer to `supabase/events_policies.sql`.

Rollout note:

- Do not use this file for event policy rollout. The old additive version could reintroduce permissive OR paths.

### supabase/emergency_contacts.sql

Purpose:

- Creates `emergency_contacts` for user-owned emergency contact records.
- Adds contact type and non-blank required field constraints.
- Adds `public.can_read_all_emergency_contacts(uuid)` for `admin`, `ea`, `eda`, `hsm`, and `health-safety-manager`.
- Adds `public.can_manage_all_emergency_contacts(uuid)` for `admin`.
- Enables RLS, grants authenticated Data API access, revokes `anon` table privileges, and creates consolidated own-CRUD, read-all, and admin-manage policies.
- Adds an `updated_at` trigger for contact updates.
- Notifies PostgREST to reload the schema cache.

Hosted status:

- Applied and verified against hosted Supabase on 2026-07-28.

### supabase/wait_on_schedules.sql

Purpose:

- Creates `wait_on_schedules` and `wait_on_assignments`.
- Adds the allowed slot constraint for Monday through Thursday lunch/dinner, Friday lunch, Saturday mop, and Sunday wait-on.
- Adds `public.can_manage_wait_ons(uuid)`.
- Enables RLS, grants authenticated Data API access, and creates manager/published-reader policies.
- Adds an `updated_at` trigger for schedule updates.
- Notifies PostgREST to reload the schema cache.

## Known Drift And Cleanup Items

- Older reference scripts may still create public helper functions before `supabase/helper_hardening.sql` moves policy usage to `private`; apply the helper hardening script after older helper/policy scripts.
- No dedicated repo SQL file currently documents the original hosted `budget_cycles`, `budget_accounts`, and `budget_transactions` table setup.

## Future Exports To Add

Ask the user for these before high-risk database work:

- Fresh full schema export.
- Fresh full RLS policy export if policies change after the 2026-06-25 export.
- Trigger definitions/attachments for `announcement_likes_apply_delta` and `rls_auto_enable`.
- Any function definitions not listed in this document.
