---
phase: 01-foundation
plan: 04
subsystem: database
tags: [drizzle-orm, seed-data, testing, neon-postgres, tsx]

# Dependency graph
requires:
  - phase: 01-foundation/01-00
    provides: Course schema with courses, modules, lessons tables
provides:
  - Database seed script for test data
  - Test course with fixed UUID for webhook testing
  - Idempotent seeding with onConflictDoNothing
affects: [enrollment-webhook-testing, course-access-verification, e2e-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed UUIDs for idempotent seeding"
    - "onConflictDoNothing for upsert-like behavior"
    - "tsx for running TypeScript scripts directly"

key-files:
  created:
    - src/db/seed.ts
  modified:
    - package.json

key-decisions:
  - "Used fixed UUIDs for idempotency - allows repeated seeding without duplicates"
  - "Separate db client in seed script to support standalone execution"

patterns-established:
  - "Seed script pattern: fixed IDs + onConflictDoNothing for idempotent data seeding"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 1 Plan 04: Database Seed Script Summary

**Idempotent seed script creating test course/module/lesson with fixed UUIDs for enrollment webhook testing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T12:22:36Z
- **Completed:** 2026-01-26T12:25:25Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created `src/db/seed.ts` with test course, module, and lesson data
- Test course uses fixed UUID `11111111-1111-1111-1111-111111111111` for deterministic testing
- Script is idempotent using `onConflictDoNothing()` - safe to run multiple times
- Added `npm run db:seed` command for easy execution

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database seed script with test course** - `881ea21` (feat)

## Files Created/Modified
- `src/db/seed.ts` - Database seed script with test course/module/lesson data
- `package.json` - Added db:seed script

## Decisions Made
- Used fixed UUIDs instead of random to enable deterministic testing and idempotency
- Created separate drizzle client instance in seed script rather than importing from `@/db` to avoid Next.js module resolution issues when running standalone
- Used `dotenv` to load `.env.local` for standalone script execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

**Database connection required.** To run the seed script:
1. Configure `DATABASE_URL` in `.env.local` (from Neon Console)
2. Run `npm run db:push` to create tables
3. Run `npm run db:seed` to populate test data

## Next Phase Readiness
- Test course available for enrollment webhook testing
- Course ID `11111111-1111-1111-1111-111111111111` can be used in API calls
- Database seed provides baseline data for development

---
*Phase: 01-foundation*
*Completed: 2026-01-26*
