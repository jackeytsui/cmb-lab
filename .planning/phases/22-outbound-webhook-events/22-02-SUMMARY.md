---
phase: 22-outbound-webhook-events
plan: 02
subsystem: api
tags: [ghl, webhooks, milestones, progress, feedback, fire-and-forget]

# Dependency graph
requires:
  - phase: 22-outbound-webhook-events
    plan: 01
    provides: WebhookDispatcher (dispatchWebhook), MilestoneDetector (detectAndDispatchMilestones)
provides:
  - Progress route wired to milestone detection on lesson completion
  - Feedback route wired to GHL webhook dispatch on coach feedback
affects:
  - 22-03 (cron retry for failed webhook deliveries)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget webhook dispatch in API routes with .catch() error swallowing"

key-files:
  created: []
  modified:
    - src/app/api/progress/[lessonId]/route.ts
    - src/app/api/submissions/[submissionId]/feedback/route.ts

key-decisions:
  - "Milestone dispatch placed after completedAt update but before response return"
  - "Feedback webhook includes userEmail to skip redundant DB lookup in dispatchWebhook"

patterns-established:
  - "Fire-and-forget integration: promise.catch(log) pattern for non-blocking webhook dispatch"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 22 Plan 02: Hook Webhooks into API Routes Summary

**Wired WebhookDispatcher and MilestoneDetector into progress and feedback API routes using fire-and-forget pattern that never blocks user responses**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T06:17:16Z
- **Completed:** 2026-01-31T06:20:25Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Progress route now dispatches milestone webhooks (lesson.milestone, module.completed, course.completed) when a lesson is newly completed
- Feedback route now dispatches feedback.sent webhook with full context when coach provides feedback
- Both integrations use fire-and-forget pattern -- errors logged but never surface to users
- Feedback dispatch passes userEmail directly to avoid redundant users table lookup
- No changes to existing response formats or status codes

## Task Commits

Each task was committed atomically:

1. **Task 1: Hook milestone detection into progress route** - `f73904c` (feat)
2. **Task 2: Hook feedback webhook dispatch into feedback route** - `910b10e` (feat)

## Files Created/Modified
- `src/app/api/progress/[lessonId]/route.ts` - Added detectAndDispatchMilestones import and fire-and-forget call in lessonComplete block
- `src/app/api/submissions/[submissionId]/feedback/route.ts` - Added dispatchWebhook import and feedback.sent dispatch after notification blocks

## Decisions Made
- Milestone dispatch placed after the completedAt DB update but before the response return, ensuring the milestone check sees the latest completion state
- Feedback webhook passes userEmail from the already-loaded submission.user relation to avoid a redundant users table query in dispatchWebhook

## Deviations from Plan

None - plan executed exactly as written. Both files already had the correct changes staged.

## Issues Encountered

None.

## User Setup Required

None - relies on GHL credentials already configured in Phase 21.

## Next Phase Readiness
- Both routes now generate ghl_webhook_events rows for successful and failed deliveries
- Failed deliveries ready for cron retry mechanism (Plan 03)
- All 5 event types now have active dispatch points in the application

---
*Phase: 22-outbound-webhook-events*
*Completed: 2026-01-31*
