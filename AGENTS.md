# AGENTS.md

This file gives coding agents a repo-specific playbook based on the current `main` branch state.

## Read this first for product behavior
- Start with `docs/project-state.md` before coding. It is the primary in-repo guide for:
  - how the app currently works,
  - what is finished,
  - what is intentionally unfinished/placeholder.
- The root `README.md` is the public GitHub-facing overview; do not treat it as the detailed implementation snapshot.
- If code behavior and `docs/project-state.md` disagree, do not guess: flag the mismatch and ask the user which source should be treated as canonical for the task.

## Project at a glance
- Stack: Vite 7 + React 19 + TypeScript + React Router 7 + Bootstrap 5.
- Backend integration: Supabase (Auth, PostgREST, RLS policies, Edge Functions).
- Primary frontend source lives in `src/`.
- Supabase SQL and Edge Function assets live in `supabase/`.

## Current app capabilities
- Auth: register/login with Supabase email/password.
- Status gating: users are routed by `profiles.status` (`pending`, `active`, `suspended`).
- Roles: role checks are based on `user_roles`, with `admin` guarding admin routes.
- Management workflows: `/app/manage/members` supports profile status and role updates.
- Announcements: feed exists with optimistic like updates.

## Known placeholders (do not treat as regressions)
- `src/pages/app/Budgets.tsx`
- `src/pages/app/SystemAdmin.tsx`

## Working conventions
- Use TypeScript for all new frontend logic.
- Keep route-level pages inside `src/pages/...`; shared auth logic belongs under `src/auth/`.
- Use the configured Supabase client from `src/config/supabaseClient.ts`.
- Respect current status and role model:
  - statuses: `pending`, `active`, `suspended`
  - admin role slug: `admin`
- Keep secrets out of source; never commit service-role keys.

## Supabase policies that are not fully in-repo
- Before DB-related work, read `docs/database.md`. Treat it as the current hosted Supabase contract unless the user provides a newer export.
- Do **not** assume hosted Supabase policies/environments match repo intent.
- If a task depends on RLS/policies/functions that are not present in this repo, explicitly mark them as "external state" in your notes.
- Preferred workflow:
  1. Check repo SQL/function files first.
  2. Compare against the target Supabase project (dashboard/SQL editor/migrations, if available).
  3. If you cannot verify external policy state, stop and ask the user for clarification or an exported policy snapshot.
- In PRs and handoff notes, separate:
  - what was changed in git,
  - what must be verified/applied in Supabase,
  - what is assumed but unverified.

## Definition of a finished change
A change is only considered complete when all of the following are true:

1. Scope is clear and implemented.
   - The requested behavior/UI/data change is fully implemented with no TODO placeholders unless explicitly requested.
2. Existing flows are preserved.
   - Authentication, status gating, role checks, and route protections still work as before unless intentionally changed.
3. Code is production-ready.
   - No debug-only artifacts or dead code are introduced.
   - New logic is typed and follows existing project structure.
4. Validation is documented.
   - Required checks are run from repo root (see below), and results are reported.
   - If a check fails, include exact failure context and whether it is pre-existing.
5. Deployment impact is explicit.
   - Any required Supabase SQL/policy/function updates are called out with exact file paths and rollout order.
   - Clearly label any hosted-Supabase assumptions as unverified until confirmed.
6. Ambiguities are resolved with the user.
   - If requirements are unclear or conflicting, stop and ask the user for clarification instead of inventing assumptions or steps.

## Quality checks before finalizing changes
Run these from repo root:

```bash
npm run lint
npm run build
```

If changes touch Supabase policy/function behavior, also validate the related SQL/function files under `supabase/` and identify any out-of-repo policy dependencies.

## Commit and PR expectations for agents
- Keep commits focused and descriptive.
- In PRs, include:
  - What changed
  - Why it changed
  - How it was validated (`lint`/`build` and any manual checks)
  - Any Supabase migration/policy rollout notes
  - Any external Supabase state that could not be verified from this repo
