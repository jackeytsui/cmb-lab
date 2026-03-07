---
phase: 17-analytics
plan: 01
title: "Analytics API Routes"
status: complete
duration: 7min
completed: 2026-01-30
subsystem: analytics
tags: [api, analytics, csv-export, drizzle, admin]

dependency-graph:
  requires: [01-foundation, 04-progress-system, 07-coach-workflow]
  provides: [analytics-api-endpoints, csv-export]
  affects: [17-02]

tech-stack:
  added: []
  patterns: [named-export-data-functions, switch-case-metric-dispatch, parallel-query-execution]

key-files:
  created:
    - src/lib/analytics.ts
    - src/app/api/admin/analytics/overview/route.ts
    - src/app/api/admin/analytics/completion/route.ts
    - src/app/api/admin/analytics/dropoff/route.ts
    - src/app/api/admin/analytics/students/route.ts
    - src/app/api/admin/analytics/difficulty/route.ts
    - src/app/api/admin/analytics/export/route.ts
  modified: []

decisions:
  - id: analytics-named-exports
    decision: "Export named data functions (getOverviewData, etc.) from each route for reuse by export endpoint"
    reason: "Enables CSV export to call same logic without duplication"
  - id: analytics-coach-export
    decision: "Export endpoint uses hasMinimumRole('coach') instead of 'admin'"
    reason: "ANLYT-08 specifies coaches can export data too"

metrics:
  tasks: 3/3
  files-created: 7
  files-modified: 0
---

# Phase 17 Plan 01: Analytics API Routes Summary

**One-liner:** 6 analytics API endpoints with date-range filtering, named data functions, and CSV export using switch/case metric dispatch

## What Was Done

### Task 1: Shared analytics utility + overview and completion endpoints
- Created `src/lib/analytics.ts` with `parseDateRange`, `formatCsvRow`, and `formatCsvResponse` utilities
- Created overview endpoint returning activeStudents (7-day window or date range), pendingReviews, totalStudents, totalCourses
- Created completion endpoint computing per-course completion rates via multi-table joins (courses > modules > lessons > lessonProgress > courseAccess)
- All queries execute in parallel using `Promise.all` where possible

### Task 2: Drop-off and at-risk students endpoints
- Created dropoff endpoint ranking lessons by abandonment rate (started but not completed)
- Created students endpoint returning all students sorted by inactivity (most inactive first)
- Drop-off uses SQL-level ratio calculation with `NULLIF` for safe division
- Students endpoint uses conditional CASE expressions for date-filtered completion counts

### Task 3: Difficulty and CSV export endpoints
- Created difficulty endpoint computing average attempts to pass per lesson from interactionAttempts
- Created export endpoint importing all 5 named data functions via switch/case on `metric` param
- Export produces CSV with appropriate column headers per metric type
- Coach role permitted for export (ANLYT-08)

## ANLYT Requirements Coverage

| Requirement | Endpoint | Status |
|-------------|----------|--------|
| ANLYT-01: Course completion rates | /api/admin/analytics/completion | Done |
| ANLYT-02: Lesson drop-off points | /api/admin/analytics/dropoff | Done |
| ANLYT-03: Active students | /api/admin/analytics/overview | Done |
| ANLYT-04: Pending reviews | /api/admin/analytics/overview | Done |
| ANLYT-05: At-risk students | /api/admin/analytics/students | Done |
| ANLYT-06: Avg interaction attempts | /api/admin/analytics/difficulty | Done |
| ANLYT-07: Date range filtering | All endpoints | Done |
| ANLYT-08: CSV export | /api/admin/analytics/export | Done |

## Decisions Made

1. **Named data function exports** - Each route exports its data function (e.g., `getOverviewData`) so the export endpoint can import and call them directly without HTTP round-trips.
2. **Coach access for export** - `hasMinimumRole("coach")` on export endpoint per ANLYT-08 spec.
3. **Date-filtered CASE expressions** - Students endpoint builds explicit SQL CASE branches for each date filter combination rather than interpolating Drizzle expressions into template literals (more robust at runtime).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unsafe SQL interpolation in students endpoint**
- **Found during:** Task 2
- **Issue:** Initial implementation tried to embed Drizzle `and()` expressions inside SQL template literals which could produce invalid SQL at runtime
- **Fix:** Rewrote to use explicit CASE expression branches for each date filter combination (from+to, from-only, to-only, no filter)
- **Files modified:** `src/app/api/admin/analytics/students/route.ts`
- **Commit:** 37d29f8

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run build` TypeScript compilation succeeds (pre-existing Clerk publishableKey failure in static generation is unrelated)
- All 6 route files exist under `src/app/api/admin/analytics/`
- `src/lib/analytics.ts` exports parseDateRange, formatCsvRow, formatCsvResponse
- Export route imports all 5 named functions and uses switch/case

## Next Phase Readiness

Plan 17-02 (Analytics Dashboard UI) can proceed. All API endpoints are ready and type-safe. The named export pattern means the dashboard components can also import data functions directly for server components if needed.
