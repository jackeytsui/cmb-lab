---
phase: 39-xp-streak-engine
plan: 01
subsystem: database
tags: [drizzle, postgres, xp, streak, gamification, pgEnum, date-fns]

# Dependency graph
requires:
  - phase: 37-app-shell
    provides: users table with dailyGoalXp and timezone columns
provides:
  - xp_events append-only ledger table with source enum
  - daily_activity per-user per-day summary table with unique constraint
  - longestStreak column on users table
  - XPEvent, DailyActivity, XPSource types for service layer
  - Migration 0009 ready to apply
affects: [39-02 (XP service functions), 39-03 (XP API integration), 39-04 (streak display), 41-progress-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [append-only event ledger with denormalized summary, pgEnum for XP source types]

key-files:
  created:
    - src/db/schema/xp.ts
    - src/db/migrations/0009_smart_the_professor.sql
  modified:
    - src/db/schema/index.ts
    - src/db/schema/users.ts

key-decisions:
  - "@date-fns/tz already installed (^1.4.1) — no new dependency needed"
  - "xp_events uses append-only pattern (no updatedAt column) for auditability"
  - "daily_activity unique constraint named daily_activity_user_date_unique for clarity"

patterns-established:
  - "Append-only event ledger: xp_events never updated/deleted, only inserted"
  - "Denormalized daily summary: daily_activity provides O(1) dashboard reads"
  - "goalXp snapshot: daily_activity.goalXp captures user's goal at time of activity, not current setting"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 39 Plan 01: XP Schema Summary

**Append-only xp_events ledger and denormalized daily_activity summary tables with xpSourceEnum, indexes, unique constraint, relations, and longestStreak on users**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T17:14:29Z
- **Completed:** 2026-02-07T17:18:41Z
- **Tasks:** 2 (1 committed, 1 no-op -- dependency already installed)
- **Files modified:** 4

## Accomplishments
- Created xp_events table with userId, source enum (5 values), amount, entityId, entityType, createdAt, and composite indexes
- Created daily_activity table with all required columns including unique constraint on (userId, activityDate)
- Added longestStreak integer column to users table
- Generated migration 0009 with enum, both tables, foreign keys, indexes, and ALTER TABLE
- Verified @date-fns/tz already installed at ^1.4.1 with working TZDate

## Task Commits

Each task was committed atomically:

1. **Task 1: Create XP schema file with tables, enum, relations, and types** - `349e0fd` (feat)
2. **Task 2: Install @date-fns/tz** - no commit (package already in dependencies at ^1.4.1)

## Files Created/Modified
- `src/db/schema/xp.ts` - XP event ledger and daily activity tables, xpSourceEnum, relations, types
- `src/db/schema/index.ts` - Added barrel export for XP schema
- `src/db/schema/users.ts` - Added longestStreak column
- `src/db/migrations/0009_smart_the_professor.sql` - Migration: CREATE TYPE xp_source, CREATE TABLE xp_events, CREATE TABLE daily_activity, ALTER TABLE users ADD longest_streak

## Decisions Made
- @date-fns/tz was already installed (^1.4.1) so no new dependency was added. Task 2 verified it works correctly with TZDate.tz().
- Followed exact schema conventions from progress.ts and practice.ts: pgTable third argument for indexes/constraints, relations pattern, type inference exports.
- xp_events table has no updatedAt column (append-only ledger pattern -- events are never modified).

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

- Run `npm run db:migrate` to apply migration 0009 (xp_events, daily_activity tables + longestStreak column) to Neon database

## Next Phase Readiness
- XP schema ready for plan 39-02 (XP service functions: awardXP, getStreak, getDailyActivity, calculateLevel)
- Both tables provide the data foundation for the entire gamification engine
- Migration needs to be applied to production database before service layer can be used

## Self-Check: PASSED

---
*Phase: 39-xp-streak-engine*
*Completed: 2026-02-07*
