---
phase: 76-team-feedback-polish
plan: 01
subsystem: ui, api, database
tags: [coaching, tts, export, sidebar, admin]

# Dependency graph
requires:
  - phase: 75-lto-student-access-mandarin-accelerator
    provides: sidebar navigation with coaching feature keys
provides:
  - Distinct sidebar icons for 1:1 vs Inner Circle coaching
  - TTS language derived from note pane field (Cantonese/Mandarin)
  - Student export access for coaching sessions
  - Fathom link column in coaching session schema and Excel export
  - Fixed assigned coach display in admin Students tab
affects: [coaching, admin-students, export]

# Tech tracking
tech-stack:
  added: []
  patterns: [note-pane-derived-language for TTS, db-user-id for cross-service references]

key-files:
  created:
    - src/db/migrations/0034_add_coaching_session_fathom_link.sql
  modified:
    - src/components/layout/AppSidebar.tsx
    - src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx
    - src/app/api/coaching/export/route.ts
    - src/app/api/coaching/sessions/[sessionId]/route.ts
    - src/lib/coaching-export.ts
    - src/db/schema/coaching.ts
    - src/app/api/admin/students/invitations/route.ts
    - src/components/admin/AddUserQuickDialog.tsx

key-decisions:
  - "Derive TTS language from note.pane field instead of parent prop for correctness"
  - "Return DB user ID from invitation endpoint to fix coach assignment"
  - "Add fathomLink to coachingSessions table rather than joining from activeStudents"

patterns-established:
  - "Note-level language derivation: use note.pane to determine zh-CN/zh-HK instead of parent component props"

requirements-completed: [FB-01, FB-02, FB-06, FB-08, FB-09]

# Metrics
duration: 9min
completed: 2026-03-25
---

# Phase 76 Plan 01: Quick Fixes & Polish Summary

**Sidebar icon differentiation, TTS language-from-pane fix, student export access with fathom link column, and assigned coach display fix via DB user ID**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-25T13:51:00Z
- **Completed:** 2026-03-25T13:59:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Inner Circle Coaching uses UsersRound icon (distinct from 1:1 Coaching FileText icon) when sidebar is collapsed
- TTS language is now derived from the note's own pane field, preventing Mandarin TTS when editing Cantonese jyutping
- Students can see and use the export button; API filters sessions by their email for security
- Fathom link field added to coaching sessions with editor UI and Excel export column
- Assigned coach display fixed: invitation endpoint now returns DB user ID so coach assignment targets the correct record

## Task Commits

Each task was committed atomically:

1. **Task 1: Sidebar Icon + TTS Bug + Export Access** - `ed00aa5` (feat)
2. **Task 2: Fathom Link + Assigned Coach Fix** - `7bb5092` (feat)
3. **Fix: Student export button visibility** - `a1d62be` (fix)

## Files Created/Modified
- `src/components/layout/AppSidebar.tsx` - Changed Inner Circle icon from FileText to UsersRound
- `src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx` - TTS language from note.pane, fathom link UI, student export button
- `src/app/api/coaching/export/route.ts` - Allow students to export own sessions
- `src/db/schema/coaching.ts` - Added fathomLink column to coachingSessions
- `src/db/migrations/0034_add_coaching_session_fathom_link.sql` - Migration for fathom_link column
- `src/lib/coaching-export.ts` - Added Fathom Link column to Excel export
- `src/app/api/coaching/sessions/[sessionId]/route.ts` - Accept fathomLink in PATCH
- `src/app/api/admin/students/invitations/route.ts` - Return dbUserId from upsert
- `src/components/admin/AddUserQuickDialog.tsx` - Use dbUserId for coach assignment

## Decisions Made
- Derived TTS language from note.pane field instead of parent prop -- ensures correctness even if component rendering changes
- Added fathomLink to coachingSessions table rather than joining from activeStudents -- keeps coaching export self-contained
- Returned DB user ID from invitation endpoint -- fixes the root cause (Clerk ID vs UUID mismatch) rather than working around it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed student export button not visible**
- **Found during:** Task 1c (Student Export Access)
- **Issue:** Export button was gated by `canWrite` which requires coach/admin role
- **Fix:** Removed `canWrite` guard from export button JSX; API already filters by email
- **Files modified:** src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx
- **Committed in:** a1d62be

**2. [Rule 1 - Bug] Fixed coach assignment using wrong ID type**
- **Found during:** Task 2b (Assigned Coach Display)
- **Issue:** AddUserQuickDialog used Clerk user ID (string) for coach assignment API that expects DB UUID
- **Fix:** Made upsertDbUserFromInvite return DB user ID; AddUserQuickDialog uses dbUserId
- **Files modified:** src/app/api/admin/students/invitations/route.ts, src/components/admin/AddUserQuickDialog.tsx
- **Committed in:** 7bb5092

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
- Run migration `0034_add_coaching_session_fathom_link.sql` on the database to add the fathom_link column

## Next Phase Readiness
- Plans 76-02 and 76-03 can proceed with remaining feedback items
- Fathom link field is ready for coaches to populate

---
*Phase: 76-team-feedback-polish*
*Completed: 2026-03-25*
