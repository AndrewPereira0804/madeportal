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
  npm run dev:test         Run Vite against the local test database.
  npm run test:env:stop    Stop only portal-tests, retaining its volumes.

URLs:
  App    http://127.0.0.1:5174  (while dev:test is running)
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

EXPENSE PERMISSION TESTS
Run npm run test:rls after test:env:start/reset has completely finished. These
real-API tests use ordinary anonymous/authenticated clients for assertions;
service-role access is reserved for creating/removing disposable fixtures.
They check submitted ownership, manager authority, approval immutability, void
attribution/reasons, locked reimbursements, House Card rules, parent deletion,
stale/concurrent approvals, and spending totals. Created test rows are cleaned up.
Do not run the suite while another process is resetting or modifying fixtures.

The reviewed baseline now includes the intentional LOCAL expense-lifecycle
migration 20261020200556. Hosted projects still need that migration and the
matching frontend rollout before they gain this workflow. Existing hosted
migration-history differences must be reconciled before an automated db push.
Privileged server maintenance (including fictional demo resets) can still manage
records; ordinary application admins cannot bypass lifecycle protections.

Broader non-expense RLS tests, automated Playwright tests, and GitHub Actions
remain subsequent work. Browser checks of the expense workflow are manual UI QA.
