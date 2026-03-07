---
phase: 61-assignments-tracking
plan: 01
subsystem: data-layer
tags: [drizzle, api, assignments, video-thread, student-resolution, coach-progress]

# Dependency graph
requires:
  - phase: 56-node-ux
    provides: videoThreads schema, thread builder
  - phase: 58-student-player-foundation
    provides: videoThreadSessions, videoThreadResponses schema
  - phase: practice-schema
    provides: assignmentTargetTypeEnum reuse
provides:
  - threadAssignments table in video-threads schema
  - thread-assignments.ts CRUD + student resolution + coach progress library
  - POST/GET at /api/admin/thread-assignments
  - DELETE/GET at /api/admin/thread-assignments/[assignmentId]
affects: [student-dashboard-thread-integration, coach-assignment-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [polymorphic-assignment-targeting, 5-path-student-resolution, session-derived-completion-status]

key-files:
  created:
    - src/lib/thread-assignments.ts
    - src/app/api/admin/thread-assignments/route.ts
    - src/app/api/admin/thread-assignments/[assignmentId]/route.ts
  modified:
    - src/db/schema/video-threads.ts

key-decisions:
  - "Reuse assignmentTargetTypeEnum from practice schema (same as video.ts pattern)"
  - "Completion status derived from videoThreadSessions rather than adding new status tracking"
  - "Response count per student via videoThreadResponses COUNT for coach progress view"

patterns-established:
  - "Thread assignment resolution: same 5 target paths as video-assignments (student, tag, course, module, lesson)"
  - "Session-based completion: not_started/in_progress/completed mapped from session status enum"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 61 Plan 01: Thread Assignment Data Layer Summary

**Thread assignment schema, CRUD library with 5-path student resolution, and coach-facing API routes for assigning video threads as homework**

## Performance

- **Duration:** 3m 9s
- **Started:** 2026-02-14T08:09:29Z
- **Completed:** 2026-02-14T08:12:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- threadAssignments table added to video-threads schema with FK to videoThreads, indexes on assignedBy and threadId, and unique constraint on (threadId, targetType, targetId)
- Reused assignmentTargetTypeEnum from practice schema (consistent with videoAssignments pattern)
- thread-assignments.ts exports 5 functions: createThreadAssignment, deleteThreadAssignment, listCoachThreadAssignments, getStudentThreadAssignments, getThreadAssignmentProgress
- Student resolution covers all 5 target paths (student, tag, course, module, lesson) with deduplication by threadId keeping most specific target
- Completion status derived from existing videoThreadSessions (not_started, in_progress, completed) -- no new status tracking needed
- Coach progress query resolves target students, LEFT JOINs sessions, and counts responses per session
- 4 API route handlers: POST + GET at /api/admin/thread-assignments, DELETE + GET at /api/admin/thread-assignments/[assignmentId]
- All routes require coach role via hasMinimumRole

## Task Commits

Each task was committed atomically:

1. **Task 1: Add threadAssignments table and thread-assignments library** - `2ce865c` (feat)
2. **Task 2: Create coach-facing API routes for thread assignments** - `14381d5` (feat)

## Files Created/Modified
- `src/db/schema/video-threads.ts` - Added threadAssignments table, threadAssignmentsRelations, ThreadAssignment/NewThreadAssignment types, assignments relation on videoThreads
- `src/lib/thread-assignments.ts` - CRUD library with createThreadAssignment, deleteThreadAssignment, listCoachThreadAssignments, getStudentThreadAssignments, getThreadAssignmentProgress
- `src/app/api/admin/thread-assignments/route.ts` - POST (create assignment) + GET (list coach assignments) with validation and error handling
- `src/app/api/admin/thread-assignments/[assignmentId]/route.ts` - DELETE (remove assignment) + GET (per-student progress) with 404 handling

## Decisions Made
- Reused assignmentTargetTypeEnum from practice schema rather than creating a new enum, maintaining consistency across all 3 assignment types (practice, video, thread)
- Completion status derived from existing videoThreadSessions table status field rather than adding redundant status tracking to thread_assignments
- Coach progress query counts videoThreadResponses per session for a "response count" metric, giving coaches visibility into student engagement depth

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
- Run `npm run db:push` or appropriate migration to create the thread_assignments table in the database

## Next Phase Readiness
- Thread assignment data layer is complete and API-accessible
- Ready for UI integration: coach assignment management page and student dashboard thread display
- Pattern fully consistent with existing video-assignments implementation

## Self-Check: PASSED

- File `src/db/schema/video-threads.ts` contains threadAssignments table
- File `src/lib/thread-assignments.ts` exports 5 functions
- File `src/app/api/admin/thread-assignments/route.ts` exists with POST + GET
- File `src/app/api/admin/thread-assignments/[assignmentId]/route.ts` exists with DELETE + GET
- Commit 2ce865c (Task 1) verified in git log
- Commit 14381d5 (Task 2) verified in git log
- TypeScript compiles cleanly (npx tsc --noEmit)

---
*Phase: 61-assignments-tracking*
*Completed: 2026-02-14*
