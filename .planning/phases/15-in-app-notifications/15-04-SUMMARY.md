---
phase: 15-in-app-notifications
plan: 04
subsystem: integration
tags: [layout, header, notifications, coach-feedback, integration]

# Dependency graph
requires:
  - phase: 15-in-app-notifications
    plan: 02
    provides: notification API routes
  - phase: 15-in-app-notifications
    plan: 03
    provides: NotificationBell component
  - phase: 15-in-app-notifications
    plan: 01
    provides: createNotification helper
provides:
  - Shared AppHeader component with NotificationBell on all dashboard pages
  - Coach feedback creates in-app notifications
  - Notification bell visible across student, coach, and admin interfaces
affects: [15-05 preferences UI, future notification triggers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared layout component pattern (AppHeader) for consistent navigation"
    - "Non-blocking notification creation with error logging"
    - "Notification trigger on coach feedback submission"

key-files:
  created:
    - src/components/layout/AppHeader.tsx
  modified:
    - src/app/(dashboard)/dashboard/page.tsx
    - src/app/(dashboard)/coach/page.tsx
    - src/app/(dashboard)/admin/page.tsx
    - src/app/(dashboard)/my-feedback/page.tsx
    - src/app/(dashboard)/my-conversations/page.tsx
    - src/app/(dashboard)/coach/students/page.tsx
    - src/app/(dashboard)/coach/conversations/page.tsx
    - src/app/(dashboard)/courses/[courseId]/page.tsx
    - src/app/api/submissions/[submissionId]/feedback/route.ts

key-decisions:
  - "AppHeader is a client component (allows NotificationBell hook), imported into server components (valid Next.js pattern)"
  - "Replace inline <header> with AppHeader, preserve content like greeting text and subtitles"
  - "Notification creation is non-blocking and wrapped in try/catch (don't fail feedback submission on notification error)"
  - "Coach name and lesson title extracted from existing data (no additional queries needed)"

patterns-established:
  - "Shared header component pattern for consistent UI across roles"
  - "Notification trigger after successful database operation, before response"
  - "Fire-and-forget pattern for notifications (don't block main flow)"

# Metrics
duration: 6min
completed: 2026-01-30
---

# Phase 15 Plan 04: Integration & Wiring Summary

**AppHeader with NotificationBell integrated across all dashboard pages, coach feedback triggers in-app notifications**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-30T09:45:30Z
- **Completed:** 2026-01-30T09:51:32Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 9

## Accomplishments
- Created AppHeader component with title prop, NotificationBell, and UserButton
- Integrated AppHeader into 8 dashboard pages (student, coach, admin)
- Coach feedback route now creates in-app notification after saving feedback
- Notification links to /my-feedback page with coach name and lesson context
- Consistent header across all main dashboard views

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AppHeader and integrate into dashboard pages** - `6221bf9` (feat)
2. **Task 2: Wire coach feedback to create in-app notification** - `214d9e2` (feat)

## Files Created/Modified
- `src/components/layout/AppHeader.tsx` - Shared header with bell + UserButton
- `src/app/(dashboard)/dashboard/page.tsx` - Replaced greeting header with AppHeader
- `src/app/(dashboard)/coach/page.tsx` - Replaced inline header with AppHeader
- `src/app/(dashboard)/admin/page.tsx` - Replaced inline header with AppHeader
- `src/app/(dashboard)/my-feedback/page.tsx` - Added AppHeader to student feedback page
- `src/app/(dashboard)/my-conversations/page.tsx` - Added AppHeader to conversations page
- `src/app/(dashboard)/coach/students/page.tsx` - Added AppHeader to student management
- `src/app/(dashboard)/coach/conversations/page.tsx` - Added AppHeader to coach conversations
- `src/app/(dashboard)/courses/[courseId]/page.tsx` - Added AppHeader with dynamic course title
- `src/app/api/submissions/[submissionId]/feedback/route.ts` - Added createNotification call

## Decisions Made
- AppHeader is a client component (needed for NotificationBell's useNotifications hook) but can be imported into server components (valid Next.js pattern)
- Preserved existing page content like greeting messages and subtitles (only replaced the title + UserButton that moved to AppHeader)
- Notification creation is non-blocking with try/catch (feedback submission succeeds even if notification fails)
- Used existing submission data (coach name, lesson title, student userId) - no additional queries needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all integrations work correctly with existing patterns.

## User Setup Required

None - uses existing authentication and notification infrastructure.

## Next Phase Readiness
- Notification system fully functional end-to-end
- Coach feedback triggers visible in-app notification
- Polling hook active on all dashboard pages (30s interval)
- Ready for preferences UI integration (Plan 05)

---
*Phase: 15-in-app-notifications*
*Completed: 2026-01-30*
