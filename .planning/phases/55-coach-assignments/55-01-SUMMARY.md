---
phase: 55-coach-assignments
plan: 01
subsystem: api, ui, database
tags: [drizzle, nextjs, youtube, assignments, coach, video]

# Dependency graph
requires:
  - phase: 50-video-schema
    provides: video.ts schema file, videoSessions table
  - phase: 46-practice-assignments
    provides: assignmentTargetTypeEnum, assignment patterns, targets API
provides:
  - videoAssignments table in schema with unique constraint
  - CRUD library for video assignments (create, delete, list)
  - POST/GET/DELETE API routes for video assignment management
  - Coach video-assignments page with create dialog
  - Coach dashboard navigation card for video assignments
affects: [55-02-student-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns: [reuse assignmentTargetTypeEnum from practice schema, reuse targets API endpoint]

key-files:
  created:
    - src/lib/video-assignments.ts
    - src/app/api/admin/video-assignments/route.ts
    - src/app/api/admin/video-assignments/[assignmentId]/route.ts
    - src/app/(dashboard)/coach/video-assignments/page.tsx
    - src/app/(dashboard)/coach/video-assignments/VideoAssignmentsClient.tsx
    - src/components/coach/VideoAssignmentDialog.tsx
  modified:
    - src/db/schema/video.ts
    - src/app/(dashboard)/coach/page.tsx

key-decisions:
  - "Import assignmentTargetTypeEnum from practice.ts rather than redeclaring (prevents Postgres duplicate type error)"
  - "Reuse existing /api/admin/assignments/targets endpoint for cascading target selection (no new API needed)"
  - "Direct DB query in server component for coach page (v7-14 pattern, avoids self-fetch 401 bug)"

patterns-established:
  - "Video assignment CRUD follows same structure as practice set assignments for consistency"

# Metrics
duration: 4m 46s
completed: 2026-02-09
---

# Phase 55 Plan 01: Video Assignments Schema, API, and Coach UI Summary

**videoAssignments table with YouTube URL validation, cascading target selects, and coach management page for assigning videos as homework**

## Performance

- **Duration:** 4m 46s
- **Started:** 2026-02-09T10:06:33Z
- **Completed:** 2026-02-09T10:11:19Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- videoAssignments table added to schema with unique constraint on (youtubeVideoId, targetType, targetId)
- CRUD library with YouTube URL extraction, target validation, and duplicate detection (23505 catch)
- POST/GET/DELETE API routes with proper role checking, error handling, and status codes (201/400/404/409)
- Coach video-assignments page with server-side data loading, create dialog, delete functionality, and empty state
- Video Assignments card added to coach dashboard navigation grid

## Task Commits

Each task was committed atomically:

1. **Task 1: Video assignments schema + CRUD library** - `4be05b7` (feat)
2. **Task 2: API routes + coach management page with create dialog** - `9ff717d` (feat)

## Files Created/Modified
- `src/db/schema/video.ts` - Added videoAssignments table, relations, and type exports
- `src/lib/video-assignments.ts` - CRUD functions: createVideoAssignment, deleteVideoAssignment, listCoachVideoAssignments
- `src/app/api/admin/video-assignments/route.ts` - POST (create) + GET (list) endpoints
- `src/app/api/admin/video-assignments/[assignmentId]/route.ts` - DELETE endpoint
- `src/app/(dashboard)/coach/video-assignments/page.tsx` - Server component with direct DB query
- `src/app/(dashboard)/coach/video-assignments/VideoAssignmentsClient.tsx` - Client wrapper with list, delete, and dialog trigger
- `src/components/coach/VideoAssignmentDialog.tsx` - Full form dialog with URL, title, notes, cascading targets, due date
- `src/app/(dashboard)/coach/page.tsx` - Added Video Assignments navigation card

## Decisions Made
- Imported `assignmentTargetTypeEnum` from `practice.ts` instead of redeclaring (prevents Postgres duplicate type error)
- Reused existing `/api/admin/assignments/targets` endpoint for cascading target selection (zero new API surface)
- Used direct DB query in server component (v7-14 pattern) to avoid self-fetch 401 bug

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Video assignment foundation complete, ready for Plan 02 (student visibility and progress monitoring)
- Schema migration will be needed when DATABASE_URL is available (videoAssignments table)

---
*Phase: 55-coach-assignments*
*Completed: 2026-02-09*
