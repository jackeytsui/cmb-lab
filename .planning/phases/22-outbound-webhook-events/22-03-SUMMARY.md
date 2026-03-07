---
phase: 22-outbound-webhook-events
plan: 03
subsystem: api
tags: [ghl, webhooks, cron, vercel, retry, inactivity, drizzle]

# Dependency graph
requires:
  - phase: 22-01
    provides: WebhookDispatcher (dispatchWebhook, deliverWebhookFromEvent), sync-logger
provides:
  - Cron route for retrying failed outbound webhooks with exponential backoff
  - Cron route for detecting inactive students and dispatching student.inactive webhooks
  - Vercel cron configuration (retry every 10 min, inactivity daily 8 AM UTC)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel cron with CRON_SECRET authorization pattern"
    - "Exponential backoff retry with cumulative delay calculation"
    - "7-day deduplication window for inactivity notifications"

key-files:
  created:
    - src/app/api/cron/ghl-webhooks/route.ts
    - src/app/api/cron/ghl-inactive/route.ts
    - vercel.json
  modified: []

key-decisions:
  - "Cumulative backoff (sum of 4^i * 60s) calculated from createdAt since sync_events has no updatedAt"
  - "Max 10 events per retry invocation, max 20 students per inactivity invocation to stay within Vercel timeout"
  - "Inactivity includes zero-activity students (enrolled but never started) via LEFT JOIN + HAVING"
  - "CRON_SECRET graceful skip in dev (returns 200 with skipped flag rather than 401)"

patterns-established:
  - "Vercel cron route pattern: maxDuration=60, dynamic=force-dynamic, CRON_SECRET auth, JSON stats response"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 22 Plan 03: Cron Retry and Inactivity Detection Summary

**Exponential backoff retry cron for failed webhooks (10-min cycle) plus daily inactivity detection cron with 7-day dedup window, both secured by CRON_SECRET**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T06:18:21Z
- **Completed:** 2026-01-31T06:22:00Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Webhook retry cron processes up to 10 failed events per invocation with cumulative exponential backoff
- Inactivity cron detects students idle 7+ days (including zero-activity students) and dispatches student.inactive webhooks
- 7-day deduplication window prevents repeated inactivity notifications for the same student
- Both routes use consistent CRON_SECRET authorization pattern with graceful dev skip
- vercel.json configures both schedules: retry every 10 minutes, inactivity daily at 8 AM UTC

## Task Commits

Each task was committed atomically:

1. **Task 1: Create webhook retry cron route** - `ff7fd49` (feat)
2. **Task 2: Create inactivity detection cron and vercel.json** - `bce6547` (feat)

## Files Created/Modified
- `src/app/api/cron/ghl-webhooks/route.ts` - Retry cron: queries failed outbound events, applies backoff, re-delivers via deliverWebhookFromEvent
- `src/app/api/cron/ghl-inactive/route.ts` - Inactivity cron: LEFT JOIN users+lesson_progress, 7-day dedup, dispatches student.inactive
- `vercel.json` - Vercel cron configuration for both routes

## Decisions Made
- Cumulative backoff calculated from `createdAt` since sync_events table has no `updatedAt` column
- Batch limits (10 retries, 20 inactivity) keep each invocation well within Vercel 60s timeout
- Zero-activity students included via LEFT JOIN with NULL check in HAVING clause
- CRON_SECRET missing returns 200 (not 401) in dev to avoid noise in local testing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

- Set `CRON_SECRET` environment variable in Vercel project settings for cron authentication

## Next Phase Readiness
- Phase 22 complete: all 3 plans delivered (dispatcher, route integration, cron jobs)
- Webhook retry loop operational once deployed to Vercel with cron enabled
- Inactivity detection ready once students exist in the system

---
*Phase: 22-outbound-webhook-events*
*Completed: 2026-01-31*
