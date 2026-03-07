---
phase: 39-xp-streak-engine
plan: 02
subsystem: gamification
tags: [xp, level-progression, timezone, date-fns, vitest, tdd, pure-functions]

# Dependency graph
requires:
  - phase: 37-app-shell
    provides: Settings page with dailyGoalXp tiers and timezone selection
provides:
  - Pure XP calculation functions (getXPForLevel, getTotalXPForLevel, calculateLevel)
  - Timezone-aware date utilities (getTodayInTimezone, getEffectiveDate, areConsecutiveDays)
  - XP amount constants and ring goal constants
  - LevelInfo type interface
affects: [39-03 (schema needs XP_AMOUNTS), 39-04 (awardXP uses calculateLevel/getTodayInTimezone), 39-05 (activity rings use RING_GOALS)]

# Tech tracking
tech-stack:
  added: ["@date-fns/tz"]
  patterns: ["TDD red-green-refactor for pure functions", "TZDate.tz() for timezone-aware dates"]

key-files:
  created:
    - src/lib/xp.ts
    - src/lib/__tests__/xp.test.ts
  modified: []

key-decisions:
  - "Used iterative level walk instead of inverse formula for calculateLevel — clearer, avoids floating point"
  - "Grace period returns yesterday date string, not a modified Date object — keeps API string-based"
  - "Negative XP treated as 0 in calculateLevel — defensive boundary"

patterns-established:
  - "TZDate.tz(timezone) + format for timezone-aware date strings"
  - "getEffectiveDate encapsulates 4-hour grace period logic in one place"
  - "Arithmetic series formula for cumulative XP thresholds"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 39 Plan 02: XP Pure Functions Summary

**TDD-driven XP level progression (linear 100+(L-1)*50, capped at 50) and timezone-aware date utilities using @date-fns/tz TZDate**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T17:15:26Z
- **Completed:** 2026-02-07T17:18:23Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments
- 44 comprehensive tests covering all pure XP functions and edge cases
- Level progression formula with cap at 50, handling negative XP gracefully
- Timezone-aware date utilities: getTodayInTimezone, getEffectiveDate (4-hour grace period), areConsecutiveDays
- Constants for XP amounts, ring goals, daily goal tiers, and max level

## Task Commits

Each task was committed atomically (TDD cycle):

1. **RED: Failing tests** - `69c1f97` (test)
2. **GREEN: Implementation** - `55d7973` (feat)

_No refactor commit needed — implementation was clean and minimal._

## Files Created/Modified
- `src/lib/xp.ts` - Pure XP calculation and date utility functions (153 lines)
- `src/lib/__tests__/xp.test.ts` - Comprehensive tests for all pure XP functions (361 lines, 44 tests)
- `package.json` - Added @date-fns/tz dependency

## Decisions Made
- Used iterative while-loop for calculateLevel instead of inverse quadratic formula — clearer code, no floating point precision issues
- areConsecutiveDays uses absolute difference, so order of arguments does not matter
- Negative XP input to calculateLevel is clamped to 0 with totalXP reflecting the clamped value
- DAILY_GOAL_TIERS uses `as const` for type safety matching settings page tiers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @date-fns/tz dependency**
- **Found during:** Task 1 (test setup)
- **Issue:** @date-fns/tz not yet installed per research notes
- **Fix:** `npm install @date-fns/tz`
- **Files modified:** package.json, package-lock.json
- **Verification:** Import succeeds, all timezone tests pass
- **Committed in:** 55d7973 (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Expected dependency installation per research notes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All pure XP functions ready for use by 39-03 (schema) and 39-04 (awardXP service)
- getTodayInTimezone and getEffectiveDate ready for streak detection in 39-04
- No blockers for next plan

## Self-Check: PASSED

---
*Phase: 39-xp-streak-engine*
*Completed: 2026-02-07*
