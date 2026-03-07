---
phase: 32-practice-set-builder
plan: 02
subsystem: api
tags: [drizzle, transactions, api-routes, next.js, practice-exercises]

# Dependency graph
requires:
  - phase: 31-practice-data-model-exercise-crud
    provides: practice schema, exercise CRUD helpers, lib/practice.ts
provides:
  - Batch exercise reorder API (PATCH /api/admin/exercises/reorder)
  - Practice set duplication API (POST /api/admin/practice-sets/[setId]/duplicate)
  - duplicatePracticeSet reusable helper in lib/practice.ts
affects: [32-practice-set-builder, drag-and-drop-builder, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [transaction-based batch reorder, set duplication with deep copy]

key-files:
  created:
    - src/app/api/admin/exercises/reorder/route.ts
    - src/app/api/admin/practice-sets/[setId]/duplicate/route.ts
  modified:
    - src/lib/practice.ts

key-decisions:
  - "Followed lessons/reorder pattern exactly for exercise reorder consistency"
  - "duplicatePracticeSet always creates draft status regardless of original"

patterns-established:
  - "Same-parent validation: reorder endpoints verify all items belong to same parent entity"
  - "Deep copy pattern: duplicate creates new parent + copies all children preserving sort order"

# Metrics
duration: 2min
completed: 2026-02-06
---

# Phase 32 Plan 02: Reorder & Duplicate APIs Summary

**Batch exercise reorder endpoint with transaction-based atomic updates and practice set duplication with full exercise deep copy**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-06T16:54:26Z
- **Completed:** 2026-02-06T16:56:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- PATCH /api/admin/exercises/reorder validates same-set constraint and updates sortOrder atomically in a transaction
- POST /api/admin/practice-sets/[setId]/duplicate creates a full copy with "(Copy)" suffix and all exercises
- duplicatePracticeSet helper added to lib/practice.ts for reuse outside API routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create batch exercise reorder API endpoint** - `a8b3ca5` (feat)
2. **Task 2: Create practice set duplication API endpoint and helper** - `54a382d` (feat)

## Files Created/Modified
- `src/app/api/admin/exercises/reorder/route.ts` - PATCH endpoint for batch exercise reorder with same-set validation
- `src/app/api/admin/practice-sets/[setId]/duplicate/route.ts` - POST endpoint for duplicating practice sets with exercises
- `src/lib/practice.ts` - Added duplicatePracticeSet helper function

## Decisions Made
- Followed lessons/reorder pattern exactly for consistency across the codebase
- Duplicated sets always start as draft regardless of original status (safety for coaches)
- Used getCurrentUser() for createdBy field on duplicated sets (matches existing pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reorder API ready for drag-and-drop UI integration (Plan 03+)
- Duplicate API ready for admin practice set list actions
- Both endpoints follow existing auth and error handling patterns

## Self-Check: PASSED

---
*Phase: 32-practice-set-builder*
*Completed: 2026-02-06*
