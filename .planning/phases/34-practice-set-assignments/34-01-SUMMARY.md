---
phase: 34-practice-set-assignments
plan: 01
subsystem: api
tags: [drizzle, assignments, crud, resolution-query, practice-sets, postgres]

# Dependency graph
requires:
  - phase: 32-exercise-builder
    provides: practice_sets and practice_exercises tables, practice.ts CRUD pattern
  - phase: 33-practice-player
    provides: practice_attempts table for completion tracking
provides:
  - Assignment CRUD library (create, delete, update due date, list)
  - Student resolution query resolving 5 assignment paths with deduplication
  - Admin API routes for assignment management
affects: [34-02 assignment UI, 34-03 student dashboard, 35-student-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-path resolution query (direct, tag, course, module, lesson) with priority-based deduplication"
    - "Unique constraint violation handling (Postgres 23505) returning 409 instead of 500"
    - "Hard delete for lightweight join records (assignments) vs soft delete for content"

key-files:
  created:
    - src/lib/assignments.ts
    - src/app/api/admin/assignments/route.ts
    - src/app/api/admin/assignments/[assignmentId]/route.ts
  modified: []

key-decisions:
  - "Hard delete for assignments (lightweight join records, not content)"
  - "Priority-based deduplication: lesson > module > course > tag > student (most specific wins)"
  - "Step-by-step resolution query using separate queries per entity type for clarity over single complex join"

patterns-established:
  - "Assignment resolution pattern: collect target entries -> group by type -> OR query -> deduplicate by priority"
  - "Unique constraint error handling: catch code 23505, return friendly message"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 34 Plan 01: Assignment CRUD + Resolution Library Summary

**Assignment CRUD with 5-path student resolution query (direct/tag/course/module/lesson) and admin API routes with unique constraint handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T03:21:23Z
- **Completed:** 2026-02-07T03:24:26Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Complete assignment CRUD library with create, delete, update due date, and list functions
- Student resolution query resolving practice sets from 5 assignment paths with priority-based deduplication
- Admin API routes (POST/GET/PUT/DELETE) with coach role guards and proper error status codes
- Unique constraint violations return 409 (not 500) with friendly error messages
- Target entity existence validation before assignment creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Assignment CRUD + resolution library** - `5c6bf6b` (feat)
2. **Task 2: Admin assignment API routes** - `2470893` (feat)

## Files Created/Modified
- `src/lib/assignments.ts` - Assignment CRUD (create, delete, updateDueDate, list) + getStudentAssignments resolution query + ResolvedAssignment type
- `src/app/api/admin/assignments/route.ts` - POST create assignment (201/400/409/500) + GET list by practiceSetId
- `src/app/api/admin/assignments/[assignmentId]/route.ts` - PUT update due date + DELETE remove assignment

## Decisions Made
- Hard delete for assignments since they are lightweight join records (not content entities that need soft delete/audit trail)
- Priority-based deduplication when same practice set assigned through multiple paths: lesson (5) > module (4) > course (3) > tag (2) > student (1) -- most specific assignment wins
- Step-by-step resolution query using separate queries per entity type rather than a single complex multi-join; this trades a few extra queries for much better readability and maintainability
- Postgres error code 23505 caught explicitly for unique constraint violations, returning 409 Conflict

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Assignment CRUD library ready for UI consumption in Plan 02 (assignment management UI)
- getStudentAssignments ready for student dashboard integration in Plan 03
- All exported functions and types available for import

## Self-Check: PASSED

---
*Phase: 34-practice-set-assignments*
*Completed: 2026-02-07*
