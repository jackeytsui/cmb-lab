---
phase: 43-activity-scoreboard
plan: 01
subsystem: database, api
tags: [drizzle, postgres, cohort-rankings, personal-bests, neon-http]

# Dependency graph
requires:
  - phase: 41-progress-dashboard
    provides: progress-dashboard.ts data fetching pattern, daily_activity and XP schema
provides:
  - showCohortRankings boolean column on users table
  - getPersonalBests() function returning 7 personal best dimensions
  - getCohortRankings() function with percentile buckets and cohort threshold
  - Preferences API showCohortRankings support in GET and PATCH
affects: [43-02 scoreboard UI, settings page preferences]

# Tech tracking
tech-stack:
  added: []
  patterns: [NeonHttp .rows accessor for raw SQL results, percentile bucket mapping]

key-files:
  created:
    - src/db/migrations/0010_regular_cardiac.sql
  modified:
    - src/db/schema/users.ts
    - src/lib/progress-dashboard.ts
    - src/app/api/user/preferences/route.ts

key-decisions:
  - "NeonHttp db.execute() returns .rows property, not iterable — use .rows[0] accessor instead of array destructuring"
  - "Percentile tiers: Top 5/10/25/50/75/90% and Bottom half based on rank among active students"
  - "Practice score dimension excluded from cohort rankings when user has < 3 completed attempts"
  - "Minimum 5 active students required for cohort rankings (returns null otherwise)"

patterns-established:
  - "Raw SQL with NeonHttp: use db.execute(sql`...`).rows[0] for single-row results"
  - "Percentile bucket mapping via percentileToBucket() helper function"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 43 Plan 01: Activity Scoreboard Backend Summary

**showCohortRankings column, getPersonalBests/getCohortRankings data functions, and preferences API extension for scoreboard backend plumbing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T07:11:27Z
- **Completed:** 2026-02-08T07:17:04Z
- **Tasks:** 3
- **Files modified:** 4 (schema, migration, progress-dashboard, preferences API)

## Accomplishments
- Added showCohortRankings boolean column to users schema with default false, generated migration 0010
- Built getPersonalBests() returning 7 dimensions (longest streak, highest daily XP + date, best practice score, total lessons, total practice sets, total conversations) via parallel queries
- Built getCohortRankings() with 5-student minimum threshold, 3 dimensions (Total XP, Longest Streak, Avg Practice Score), and friendly percentile buckets
- Extended preferences API GET and PATCH handlers with showCohortRankings support and boolean validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add showCohortRankings column to users schema and generate migration** - `a0863ad` (feat)
2. **Task 2: Add getPersonalBests() and getCohortRankings() to progress-dashboard.ts** - `f8147c2` (feat)
3. **Task 3: Extend preferences API to support showCohortRankings** - `20fa0fb` (feat)

## Files Created/Modified
- `src/db/schema/users.ts` - Added showCohortRankings boolean column with default false, imported boolean from pg-core
- `src/db/migrations/0010_regular_cardiac.sql` - ALTER TABLE adding show_cohort_rankings column
- `src/lib/progress-dashboard.ts` - Added PersonalBests/CohortRanking interfaces, getPersonalBests(), getCohortRankings(), and percentileToBucket() helper
- `src/app/api/user/preferences/route.ts` - Added showCohortRankings to GET columns/response, PATCH destructuring/validation/updateData/returning/response

## Decisions Made
- Used NeonHttp `.rows[0]` accessor pattern for raw SQL query results (NeonHttpQueryResult does not support array destructuring)
- Practice score dimension uses separate cohort size (students with >= 3 completed attempts) rather than overall active student count
- Percentile calculation: (studentsBelow / totalInCohort) * 100, then mapped to 7 friendly bucket labels

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NeonHttp db.execute() result access pattern**
- **Found during:** Task 2 (getCohortRankings implementation)
- **Issue:** Plan suggested `const [result] = await db.execute(sql`...`)` but NeonHttpQueryResult is not iterable — it has a `.rows` property instead
- **Fix:** Changed all raw SQL result access to use `.rows[0]` pattern (e.g., `activeCountRows.rows[0]?.total`)
- **Files modified:** src/lib/progress-dashboard.ts
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** f8147c2 (Task 2 commit)

**2. [Rule 1 - Bug] Removed redundant streak below query**
- **Found during:** Task 2 (getCohortRankings implementation)
- **Issue:** Initial implementation had a GROUP BY query that returned one row per student instead of a count — needed a wrapping COUNT subquery
- **Fix:** Removed the redundant first query, kept only the correct subquery-wrapped COUNT version
- **Files modified:** src/lib/progress-dashboard.ts
- **Verification:** Query structure correct, type check passes
- **Committed in:** f8147c2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for type safety and correct query results. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
- Run `npm run db:migrate` to apply migration 0010 (show_cohort_rankings column) to Neon database

## Next Phase Readiness
- All backend data functions ready for scoreboard UI (Plan 02)
- getPersonalBests() and getCohortRankings() exported and type-safe
- Preferences API ready for opt-in toggle component
- Migration pending user action before DB column is available at runtime

## Self-Check: PASSED

All 4 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 43-activity-scoreboard*
*Completed: 2026-02-08*
