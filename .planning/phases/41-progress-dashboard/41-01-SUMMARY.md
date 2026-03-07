---
phase: 41-progress-dashboard
plan: 01
subsystem: database, api
tags: [recharts, react-activity-calendar, shadcn-ui, drizzle, date-fns, badges, heatmap, xp-timeline]

# Dependency graph
requires:
  - phase: 39-xp-gamification
    provides: dailyActivity table, xpEvents table, longestStreak column, XP system infrastructure
provides:
  - recharts + shadcn/ui chart component installed
  - react-activity-calendar installed
  - 5 server-side data fetching functions for progress dashboard (getXPTimeline, getActivityHeatmap, getMasteryData, getBadgeStats, getWeeklySummary)
  - 12 static badge definitions with check functions and computeBadges helper
  - UserStats, BadgeDefinition, BadgeResult types
affects: [41-02-PLAN, 41-03-PLAN, 41-04-PLAN, 41-05-PLAN]

# Tech tracking
tech-stack:
  added: [recharts@2.15, react-activity-calendar@3.1]
  patterns: [server-side dashboard data fetching via direct Drizzle queries, static badge definitions computed at render time, contiguous date gap-filling for heatmaps]

key-files:
  created:
    - src/lib/progress-dashboard.ts
    - src/lib/badges.ts
    - src/components/ui/chart.tsx
  modified:
    - package.json

key-decisions:
  - "Heatmap XP level thresholds: 0/25/75/150 for levels 0-4 (maps to nothing/light/moderate/active/very-active)"
  - "Badge definitions are static TypeScript config not DB-stored -- avoids sync problems, computed from UserStats at render time"
  - "Current streak computed by backward walk through daily_activity rows with 1-day gap tolerance for streak freezes"
  - "Conversation count uses dailyActivity SUM rather than querying conversations table directly"

patterns-established:
  - "Server-side dashboard queries: all data fetching via direct Drizzle DB queries, no self-fetch API routes"
  - "Contiguous date gap-filling: generate full date range with eachDayOfInterval, left-merge with actual data, fill missing with zeros"
  - "Single JOIN mastery query: courseAccess -> courses -> modules -> lessons LEFT JOIN lessonProgress, GROUP BY course+module"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 41 Plan 01: Progress Dashboard Data Layer Summary

**Recharts + react-activity-calendar installed, 5 server-side Drizzle query functions for XP timeline/heatmap/mastery/badges/weekly-summary, and 12 static badge definitions with computation logic**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T03:19:16Z
- **Completed:** 2026-02-08T03:24:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed recharts via shadcn/ui chart component and react-activity-calendar for heatmap visualization
- Created 5 server-side data fetching functions that all query the DB directly via Drizzle (avoiding the known 401 self-fetch bug)
- Defined 12 static badges across 4 categories (learning, streak, XP, practice) with progress tracking
- XP timeline supports daily/weekly/monthly grouping with gap-filling; heatmap produces contiguous 365-day array; mastery uses single JOIN query

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create badge definitions** - `791427e` (feat)
2. **Task 2: Create progress-dashboard data fetching library** - `aab5421` (feat)

## Files Created/Modified
- `src/components/ui/chart.tsx` - shadcn/ui chart wrapper (ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig)
- `src/lib/badges.ts` - 12 static badge definitions with UserStats type and computeBadges function
- `src/lib/progress-dashboard.ts` - 5 server-side query functions: getXPTimeline, getActivityHeatmap, getMasteryData, getBadgeStats, getWeeklySummary
- `package.json` - Added recharts and react-activity-calendar dependencies

## Decisions Made
- Heatmap XP level thresholds set to 0/25/75/150 for levels 0-4 (nothing / light / moderate / active / very active) -- maps to casual-to-serious daily XP goals
- Badge definitions are static TypeScript config, not database-stored -- computed from UserStats at render time to avoid sync problems
- Current streak computed by backward walk through daily_activity rows with 1-day gap tolerance for streak freezes (matches existing project convention)
- Conversation count aggregated from dailyActivity.conversationCount SUM rather than querying conversations table directly (more efficient, already denormalized)
- Mastery query uses innerJoin for courseAccess->courses->modules->lessons to only show modules that actually have lessons

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Data layer complete: all 5 query functions ready for UI consumption
- Plans 02-05 can now build dashboard page and components consuming these functions
- Badge definitions ready for BadgeCollection component (Plan 05)
- ChartContainer and react-activity-calendar ready for XP Timeline and Heatmap components (Plans 02-03)

## Self-Check: PASSED

All files verified present:
- src/lib/progress-dashboard.ts
- src/lib/badges.ts
- src/components/ui/chart.tsx

All commits verified:
- 791427e (Task 1)
- aab5421 (Task 2)

---
*Phase: 41-progress-dashboard*
*Completed: 2026-02-08*
