# Version Updates

This file tracks real-user issue fixes and production-facing version updates from 2026-09-03 onward.

Use this as the running internal release log when changes are made because of user feedback, operational issues, or production rollout needs. Keep newest entries first.

## How To Update This Log

For each version update, record:

- Date
- Short title
- User impact or reported issue
- What changed
- Files changed
- Validation run
- Deployment notes
- Supabase rollout notes, if any

Label hosted Supabase policy, function, trigger, or environment assumptions as external/unverified state unless they have been checked against the target project.

## Unreleased

### House Meeting Attendance

- User impact or reported issue: Recorder needs to take attendance at house meetings because missing a required house meeting can lead to a future fine.
- What changed: Added Recorder-only house meeting attendance for active brothers and neophytes with `present`, `excused`, and `absent` statuses. Attendance remains editable indefinitely and does not expose member self-viewing yet.
- Files changed: `api/demo/reset.ts`, `docs/database.md`, `docs/project-state.md`, `docs/version-updates.md`, `src/auth/roleAccess.ts`, `src/index.css`, `src/lib/eventTools.ts`, `src/lib/houseMeetingAttendance.ts`, `src/pages/app/tools/ChairTools.tsx`, `src/pages/app/tools/HouseMeetingsTool.tsx`, `supabase/migrations/20260903011436_add_house_meeting_attendance.sql`
- Validation run: `npm run lint` failed only on the five pre-existing React hook lint errors in budget and wait-on pages; no new lint errors remained after fixing the house-meeting page. `npm run build` passed. Demo Supabase schema/policy/grant verification passed for `event_attendance`.
- Deployment notes: Local branch `recorder-attendance`; no PR created.
- Supabase rollout notes: Demo hosted Supabase only was migrated and verified on 2026-09-03. Production has not been changed; production rollout is staged in `supabase/migrations/20260903011436_add_house_meeting_attendance.sql`.

## 2026-09-03 - Version Tracking Started

- User impact or reported issue: Real users are now using the portal, and first user-reported issues are being triaged.
- What changed: Added this internal version-update log so production-facing fixes can be tracked consistently from this point forward.
- Files changed: `.gitignore`, `docs/version-updates.md`, `docs/project-state.md`
- Validation run: `npm run lint` failed on pre-existing React hook lint errors in budget and wait-on pages; `npm run build` passed.
- Deployment notes: No app deployment required for this tracking entry.
- Supabase rollout notes: None.
