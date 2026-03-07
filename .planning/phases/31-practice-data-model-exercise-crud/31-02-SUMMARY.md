---
phase: 31-practice-data-model-exercise-crud
plan: 02
subsystem: api
tags: [drizzle, crud, zod, exercises, practice-sets, soft-delete, next-api-routes]

# Dependency graph
requires:
  - phase: 31-01
    provides: practice DB schema (practiceSets, practiceExercises tables), ExerciseDefinition types, Zod schemas
provides:
  - CRUD library helpers for exercises and practice sets (src/lib/practice.ts)
  - Exercise API routes at /api/admin/exercises
  - Practice set API routes at /api/admin/practice-sets
  - parseBlankSentence utility for fill-in-blank exercises
affects: [31-03, 31-04, 31-05, 31-06, 32, 33]

# Tech tracking
tech-stack:
  added: []
  patterns: [practice CRUD lib pattern, Zod discriminated union API validation]

key-files:
  created:
    - src/lib/practice.ts
    - src/app/api/admin/exercises/route.ts
    - src/app/api/admin/exercises/[exerciseId]/route.ts
    - src/app/api/admin/practice-sets/route.ts
    - src/app/api/admin/practice-sets/[setId]/route.ts
  modified: []

key-decisions:
  - "Used getCurrentUser() from lib/auth for practice set creator lookup (reuses existing Clerk-to-internal-ID pattern)"
  - "Exercise POST validates definition.type matches declared type field for consistency"
  - "parseBlankSentence skips empty text segments (handles templates starting/ending with {{blank}})"

patterns-established:
  - "Practice CRUD lib: all queries filter by deletedAt IS NULL, soft-delete returns updated row or null"
  - "Exercise API validation: Zod safeParse on definition + type consistency check + language enum validation"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 31 Plan 02: Exercise & Practice Set CRUD Summary

**CRUD library helpers and 5 API route files for exercises and practice sets with Zod-validated definitions, coach role gates, and soft-delete**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06T15:32:05Z
- **Completed:** 2026-02-06T15:36:30Z
- **Tasks:** 3
- **Files created:** 5

## Accomplishments
- Created `src/lib/practice.ts` with 11 exported functions (5 practice set CRUD, 5 exercise CRUD, 1 utility)
- Built exercise API routes with Zod discriminated union validation on POST/PUT
- Built practice set API routes with getCurrentUser() for creator assignment
- All endpoints gated behind `hasMinimumRole("coach")` with consistent error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CRUD library helpers and parseBlankSentence utility** - `c6f642f` (feat)
2. **Task 2: Create exercise API routes (list, create, get, update, delete)** - `322158f` (feat)
3. **Task 3: Create practice-sets API routes (minimal CRUD for Phase 31)** - `f6df135` (feat)

## Files Created/Modified
- `src/lib/practice.ts` - CRUD helpers for practice sets and exercises, parseBlankSentence utility
- `src/app/api/admin/exercises/route.ts` - GET (list by practiceSetId) + POST (create with Zod validation)
- `src/app/api/admin/exercises/[exerciseId]/route.ts` - GET + PUT + DELETE for single exercise
- `src/app/api/admin/practice-sets/route.ts` - GET (list with status filter) + POST (create with user lookup)
- `src/app/api/admin/practice-sets/[setId]/route.ts` - GET (set + exercises) + PUT + DELETE

## Decisions Made
- Used `getCurrentUser()` from existing `@/lib/auth` for practice set creator lookup rather than duplicating Clerk-to-internal-ID logic
- Exercise POST validates that `body.definition.type` matches `body.type` for consistency between metadata and definition
- `parseBlankSentence` skips empty text segments, correctly handling templates that start/end with `{{blank}}`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Exercise and practice set CRUD APIs are ready for Plan 03 (assignment API routes)
- parseBlankSentence utility ready for Plan 05 (exercise forms) and Phase 33 (student player)
- All routes type-check cleanly with the full project tsconfig

## Self-Check: PASSED

---
*Phase: 31-practice-data-model-exercise-crud*
*Completed: 2026-02-06*
