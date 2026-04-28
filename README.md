# SAE Massachusetts Delta Portal

Internal web portal for chapter operations and member access.

This repository currently contains a Vite + React + TypeScript frontend with Supabase auth/data integration, role-based access, and an admin account-management flow.

## Current State (as of March 12, 2026)

Implemented:
- Email/password registration and login via Supabase Auth.
- Account status gating (`pending`, `active`, `suspended`) using `profiles.status`.
- Role-aware navigation and admin route protection using `user_roles`.
- Admin account management page with status tabs, approval/suspension actions, and role editing.
- Announcements feed from Supabase with optimistic like count updates.
- Supabase Edge Function scaffold to sync `profiles.email` with `auth.users`.

Partially implemented / placeholders:
- `src/pages/app/Budgets.tsx` is a placeholder.
- `src/pages/app/Account.tsx` is a placeholder.

## Tech Stack

- React 19
- TypeScript
- Vite 7
- React Router 7
- React Hook Form
- Bootstrap 5 + custom CSS
- Supabase (Auth, PostgREST, Edge Functions)

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create a local env file (for example `.env.local`) with:

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Notes:
- Frontend code uses only `VITE_` variables.
- `SUPABASE_SERVICE_ROLE_KEY` is required for the edge function.
- Treat service-role keys as secrets.

### 3) Start the app

```bash
npm run dev
```

### 4) Build for production

```bash
npm run build
```

## NPM Scripts

- `npm run dev`: start local Vite dev server
- `npm run build`: TypeScript build + production bundle
- `npm run preview`: preview production bundle locally
- `npm run lint`: run ESLint

## Routing Overview

Public routes:
- `/`: landing page
- `/login`: login form
- `/register`: registration form
- `/pending`: shown to logged-in users waiting for approval
- `/suspended`: shown to suspended accounts

Protected routes:
- `/app/*`: requires authenticated session
- `/app/scheduling`
- `/app/budgets`
- `/app/announcements`
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

## RLS / Policies

Base account/role policies are in:
- `supabase/admin_accounts_policies.sql`

Event calendar + semester + visibility policies are in:
- `supabase/events_calendar_policies.sql`

This SQL defines:
- `public.is_admin(uuid)` helper function
- RLS enablement for `profiles`, `user_roles`, and `roles`
- self-read/self-insert rules for users
- admin read/update rules for profile and roles management

Apply it in Supabase SQL Editor before testing admin workflows.

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

Typical commands:

```bash
npx supabase functions serve sync_profile_emails --env-file .env.local
npx supabase functions deploy sync_profile_emails
```

## Project Structure

```text
src/
  auth/                 auth context + route/status/role hooks
  config/               supabase client
  layout/               main app shell/nav
  pages/
    admin/              admin pages (accounts, events placeholder)
    app/                authenticated app pages
supabase/
  admin_accounts_policies.sql
  functions/
    sync_profile_emails/
```

## Collaboration Starting Points

High-impact next tasks:
1. Replace remaining placeholder app pages (Budgets/Account) with real data models and UI.
2. Add announcement visibility filtering by user role.
3. Replace global announcement like counter with per-user likes/reactions table.
4. Add tests for auth gating and admin account actions.
5. Remove remaining debug logs and standardize error handling UX.

## Security Notes

- Keep service-role keys out of frontend logic.
- Do not expose secrets in commits, issues, or pull requests.
- If secrets were ever shared publicly, rotate them in Supabase immediately.
