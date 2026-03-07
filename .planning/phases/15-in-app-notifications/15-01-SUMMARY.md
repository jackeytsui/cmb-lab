---
phase: 15-in-app-notifications
plan: 01
subsystem: database
tags: [drizzle, postgres, notifications, pgEnum, indexes]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users table (FK target for notifications)
provides:
  - notifications table with type/category enums, soft delete, indexes
  - notification_preferences table with per-category mute support
  - createNotification() server-side helper with preference-aware filtering
affects: [15-in-app-notifications remaining plans, coach feedback integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preference-aware notification creation (check mute before insert)"
    - "Composite indexes for polling performance (userId+read, userId+createdAt)"

key-files:
  created:
    - src/db/schema/notifications.ts
    - src/lib/notifications.ts
    - src/db/migrations/0002_young_squadron_sinister.sql
  modified:
    - src/db/schema/index.ts

key-decisions:
  - "text column for metadata (JSON string) instead of jsonb -- consistent with codebase, no metadata querying needed yet"
  - "Check mute preferences at creation time, not display time (Pitfall 4 from research)"

patterns-established:
  - "Notification creation via server-side helper only -- never client-side"
  - "Preference check before insert to avoid creating muted notifications"

# Metrics
duration: 4min
completed: 2026-01-30
---

# Phase 15 Plan 01: Notifications Schema & Helper Summary

**Notifications and preferences Drizzle schema with createNotification() helper that checks mute preferences before inserting**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-30T09:01:06Z
- **Completed:** 2026-01-30T09:05:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Notifications table with 12 columns, 2 enums (type + category), composite indexes, soft delete
- Notification preferences table with per-category mute support
- createNotification() helper that checks user preferences before inserting (returns null if muted)
- Drizzle migration generated and barrel export updated

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notifications schema and generate migration** - `8494445` (feat)
2. **Task 2: Create server-side createNotification helper** - `7e5656e` (feat)

## Files Created/Modified
- `src/db/schema/notifications.ts` - notifications + notification_preferences tables, enums, relations, types
- `src/db/schema/index.ts` - Added barrel export for notifications module
- `src/lib/notifications.ts` - createNotification() server-side helper with mute check
- `src/db/migrations/0002_young_squadron_sinister.sql` - Drizzle migration for new tables

## Decisions Made
- Used `text` column for metadata (JSON string) rather than `jsonb` -- consistent with existing codebase pattern and no metadata querying is needed
- Check mute preferences at creation time (not display time) per Pitfall 4 from research -- prevents muted notifications from being created and counted

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run db:push` failed due to missing DATABASE_URL in local env (expected -- Neon credentials are in deployment env only). Migration file was generated successfully and schema compiles cleanly.

## User Setup Required

None - no external service configuration required. Migration file will be applied when DATABASE_URL is available.

## Next Phase Readiness
- Schema and helper ready for API routes (Plan 02) and UI components (Plans 03-04)
- createNotification() can be integrated into coach feedback route when notification triggers are wired up

---
*Phase: 15-in-app-notifications*
*Completed: 2026-01-30*
