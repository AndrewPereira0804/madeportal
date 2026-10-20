ISOLATED LOCAL TEST ENVIRONMENT

Prerequisites: npm ci, Node.js 22+, and a running local Docker engine using
Linux containers. On Windows the helper detects per-user and standard Docker
Desktop installations, so Docker need not already be on PATH.

Commands (run from the repository root):
  npm run test:env:start   Start portal-tests; seed and verify it.
  npm run test:env:reset   Rebuild only portal-tests; seed and verify it.
  npm run test:env:verify  Compare schema/grants and verify all account logins.
  npm run test:env:status Show local URLs without printing credentials.
  npm run test:env:guards Check rejection of hosted/arbitrary command flags.
  npm run test:rls         Run expense and application permission tests locally.
  npm run test:e2e         Start local services and run Chromium browser tests.
  npm run test:e2e:ui      Open the Playwright test runner for debugging.
  npm run test:e2e:report  Open the last browser-test HTML report.
  npm run test:e2e:types   Type-check the Playwright config and tests.
  npm run dev:test         Run Vite against the local test database.
  npm run test:env:stop    Stop only portal-tests, retaining its volumes.

URLs:
  App    http://127.0.0.1:5174  (while dev:test is running)
  E2E    http://127.0.0.1:5175  (owned by the Playwright runner)
  API    http://127.0.0.1:55431
  Studio http://127.0.0.1:55433
  Mail   http://127.0.0.1:55434

Fictional accounts use <key>@portal.test and password PortalTestOnly!2026.
Keys: admin, president, recorder, treasurer, chair, rush, member, other-member,
alumni, neophyte, pending, suspended. Statuses/roles are in fixtures.mjs.
Do not reuse this test password for real accounts. No real users are copied.
Generated Auth UUIDs and fixed example record IDs are in .test-env/fixtures.json.
All generated settings and credentials remain under ignored .test-env/.

The helper fixes the Docker project, network, API URL, and ports. It checks the
local Docker context and container label; accepts no URL, --linked, --all,
--db-url, or arbitrary passthrough flags; and invokes reset with --local.
Published ports bind to loopback. The existing portal stack and hosted projects
are not reset, stopped, or relinked. Normal .env files are not edited. dev:test
sets the local API variables in the child process; it does not enable demo resets.
Avoid running multiple start/reset commands concurrently on this shared test DB.
Run reset after adding migrations or when a completely clean fixture set is
needed. Start resumes the existing volume and refreshes the supplied fixtures;
verification rejects missing migrations, unexpected record counts, or roles.
Docker Desktop sometimes ignores a network's default loopback binding; the helper
then recreates only portal-tests containers with explicit localhost port bindings,
retains their volumes, and checks their health. Recovery specs (local credentials
included) stay under ignored .test-env/docker-recovery/.

LOCAL REPLAY AND HOSTED HISTORY
The helper copies current root migrations and seed.sql into .test-env/supabase/.
replay-exclusions.json explicitly omits the historical demo-only alternative
announcement-reply rollout, whose objects are already created by the earlier
canonical migrations. The original file remains untouched for provenance.
The one-time destructive user-cleanup migration is archived under maintenance/.
Future migrations are automatically included unless explicitly reviewed/excluded.

This setup does NOT reconcile existing hosted migration version numbers. Do not
use the generated test workspace for db push or link it to a hosted project.
Hosted migration-history cleanup is a separate deployment prerequisite.

schema-baseline.json fingerprints the reviewed 2026-10-20 production application
catalog: columns, constraints, functions, indexes, RLS policies, relations,
triggers, enums, and table/column grants. Platform extensions, default privileges,
and schema ACLs are excluded because the local Supabase distribution supplies
them. Intentional future schema changes require reviewing/updating the baseline;
do not silently replace it merely to make verification pass.

Seed SQL contains reference roles/majors only. The helper creates email/password
Auth users via the local admin API and then assigns fictional profiles/records.
Active users receive their roles before activation to satisfy the real guards.
Pending/suspended accounts have no assigned roles. RLS policies are not relaxed.

RLS INTEGRATION TESTS
Run npm run test:rls after test:env:start/reset has completely finished. These
real-API tests use ordinary anonymous/authenticated clients for assertions;
service-role access is reserved for setup, stored-data verification, and cleanup.
expenses.test.mjs checks submitted ownership, manager authority, approval
immutability, void attribution/reasons, locked reimbursements, House Card rules,
parent deletion, stale/concurrent approvals, and spending totals.
application.test.mjs covers all 18 application tables: profiles and membership
approval, role hierarchy and escalation, announcements/replies/likes, event
categories and visibility, calendars, recorder attendance, emergency contacts,
published/draft wait-ons, budget access/allocation, reference data, and the
default-denied audit/legacy finance tables. It also checks stale privileged roles
on inactive profiles, role revocation without re-login, Auth metadata escalation,
and public legacy helper RPC permissions.

Tests send real HTTP requests, not mocked policies or service-role assertions.
Denied writes must return 42501 or affect zero rows and leave stored data intact;
invalid payload/schema errors do not count as authorization passes. Denied
updates/deletes must target an existing record. Successful operations are checked
alongside denials. Expected constraint failures and atomic rollbacks are explicit.
Denied writes request minimal responses so a SELECT/RETURNING restriction cannot
hide a missing write restriction; stored rows are checked with the setup client.
Temporary rows, profiles, role assignments, and metadata are restored in cleanup.
npm run test:env:verify checks fixture counts across every application table.

The npm command serializes test files because they share the same 12 local users.
Do not run the suite while another process is testing, resetting, or modifying
fixtures. No hosted credentials or user data are used by the tests.

CURRENT PERMISSION DISTINCTIONS
Pending/suspended users retain own-profile reads/edits and own-emergency-contact
CRUD, plus read-only roles/majors catalogs; they cannot gain access to other
users' data.
PR is a valid role assignment but currently grants no announcement publishing.
Presidents/vice presidents and HSM can read others' emergency contacts; only
admins can edit/delete others' contacts. Recorder attendance access requires the
recorder role, including for an app admin. Presidents can delete others'
announcements but only authors/admins can edit them. These are existing rules;
the expanded tests do not change policies, grants, or hosted schemas.

The reviewed baseline includes expense-lifecycle migration 20261020200556.
Applied through Supabase MCP on 2026-10-20: demo version 20261020203631,
production version 20261020203900, both named enforce_expense_lifecycle.
The matching frontend must be deployed for approval/void UI compatibility.
Existing hosted migration-history differences must be reconciled before an
automated db push; do not reapply this migration under its local version.
Privileged server maintenance (including fictional demo resets) can still manage
records; ordinary application admins cannot bypass lifecycle protections.

PLAYWRIGHT BROWSER TESTS
The installed Playwright browser binaries include Chromium. If they are missing
after npm ci, run npx playwright install chromium once. Docker Desktop
must be running with Linux containers. npm run test:e2e starts/resumes only the
portal-tests stack, refreshes/verifies fictional fixtures, and launches the real
app on dedicated port 5175. Keep that port free; another server is never reused.
It does not stop the retained local database after testing. Use test:env:stop
when finished. Do not run RLS tests or modify local fixtures during browser tests.

The 15 initial Chromium tests cover protected navigation, failed login,
login/reload/logout, pending/suspended screens, management and budget access,
submitted-expense creation/edit/delete/validation, approval confirmation and
cancellation, retained voids and budget totals, locked reimbursements, House Card
requests, stale approval after a real browser edit, and the mobile approval popup.
Every test gets a fresh browser context. Expense records have unique vendor tags
and are removed in fixture teardown, including after assertion failures. Global
teardown verifies the reviewed schema and all fixture counts/statuses/roles.

The browser uses real password login and the real local Auth/REST APIs. The local
service-role client stays in the Node test process for setup and stored-data
verification/cleanup. Browser HTTP requests may reach only app port 5175 and API
port 55431. The known Vercel analytics script is fulfilled with an inert local
response; all other external requests are blocked and fail the test. No Auth or
database responses are mocked. Uncaught browser errors also fail the test.

Screenshots, videos and traces are retained on failures under test-results/;
playwright-report/ contains the HTML report. Both are ignored by Git. Tests run
with one worker and no automatic retries. The normal interactive dev:test server
on 5174 can remain open, but do not use it to edit shared fixtures during tests.
In UI mode, stopping the runner before teardown finishes can leave test data;
use test:env:reset to recover if fixture verification reports leftovers.

GITHUB ACTIONS
The installer-generated .github/workflows/playwright.yml now runs type checks,
the app build, local test safeguards, the RLS suite, fixture verification, and
the Playwright suite on pushes/PRs to main or manual dispatch. The Ubuntu runner
uses its own disposable Docker database; no hosted Supabase secrets are required.
It uploads browser reports/failure artifacts for 7 days and stops its local stack.
The workflow has not been exercised on GitHub until these files are pushed.
Full-repository lint is not yet a CI gate because of the previously identified
React effect lint failures. Required branch checks and deployment gates remain
separate repository/hosting settings; this workflow does not deploy anything.

These suites do not yet test Storage, Realtime, Auth configuration, server API
routes, or every possible combination of roles, browsers, and payloads.
