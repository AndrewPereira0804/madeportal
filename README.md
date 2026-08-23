# Mass Delta Portal

Mass Delta Portal is a private chapter operations app for managing member access, announcements, events, budgets, scheduling, and role-specific officer tools in one place.

The app is built as a React single-page application backed by Supabase Auth, PostgREST, row-level security policies, and a small set of Supabase/Vercel server-side utilities.

## Demo Deployment
Visit the Demo deployment of this site to experiment with functionality at:

madeportal-demo.vercel.app

## What It Supports

- Member registration, login, approval, suspension, and account status routing.
- Role-based access for chapter officers, administrators, and members.
- A dashboard that adapts to a user's chapter status and active roles.
- Chapter announcements with authoring, editing, replies, and like state.
- A shared chapter calendar with event visibility rules.
- Event management tools for officer workflows, including social, formal, alumni, rush, service, philanthropy, scholarship, professional development, house meeting, work party, and new-member events.
- Treasurer workflows for budget cycles, role allocations, expense requests, approvals, reimbursements, and account-level transaction history.
- Steward wait-on scheduling and member-facing weekly wait-on assignments.
- Member directory, profile details, emergency contacts, and chapter management surfaces.
- Demo environment reset support for deployments that need seeded public data.

## Access Model

Authentication uses Supabase email/password accounts. Application access is controlled by two layers:

- `profiles.status` determines whether a signed-in user is pending, active, or suspended.
- `user_roles` determines what chapter tools and management actions an active user can access.

Administrative and officer permissions are enforced in the UI and supported by Supabase RLS/policy SQL in the repository. Hosted Supabase policy state should still be verified before production rollout.

## Tech Stack

- Vite 7
- React 19
- TypeScript
- React Router 7
- Bootstrap 5
- Supabase Auth, PostgREST, RLS, and Edge Functions

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file from the example:

```bash
cp .env.example .env.local
```

Fill in the Supabase values in `.env.local`. Browser-exposed values use the `VITE_` prefix; service-role keys must stay server-only and must never be committed.

Start the dev server:

```bash
npm run dev
```

Run validation checks:

```bash
npm run lint
npm run build
```

## Supabase Notes

Supabase SQL, policy references, migrations, and Edge Function source live under `supabase/`. The database contract and hosted-policy notes are tracked in `docs/database.md`.

If a change depends on RLS policies, triggers, functions, or hosted configuration, compare the repo files with the target Supabase project before rollout.


