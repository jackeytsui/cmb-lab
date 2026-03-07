---
phase: 22-outbound-webhook-events
plan: 01
subsystem: api
tags: [ghl, webhooks, milestones, drizzle, typescript]

# Dependency graph
requires:
  - phase: 21-ghl-sync-infrastructure
    provides: sync-logger, contacts, client, echo-detection, ghl schema tables
  - phase: 18-certificates
    provides: checkCourseCompletion function
provides:
  - WebhookDispatcher service (dispatchWebhook, deliverWebhook, deliverWebhookFromEvent)
  - MilestoneDetector service (checkModuleCompletion, detectAndDispatchMilestones, getMilestoneLessonIds)
  - Typed webhook payloads for 5 event types
  - Duplicate webhook detection (1-hour window)
affects:
  - 22-02 (progress route integration)
  - 22-03 (cron retry and inactive student detection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget dispatch with error logging pattern"
    - "In-memory cache with TTL for admin-configurable lookups"
    - "Graceful skip for unlinked GHL contacts"

key-files:
  created:
    - src/lib/ghl/webhooks.ts
    - src/lib/ghl/milestones.ts
  modified: []

key-decisions:
  - "Tag naming convention: lms:{eventType} (e.g. lms:module.completed)"
  - "Optional GHL_WEBHOOK_URL env var for full payload delivery alongside tag addition"
  - "5-minute in-memory TTL cache for milestone lesson IDs to avoid per-request DB queries"
  - "Graceful skip (not error) when user has no GHL contact linked"

patterns-established:
  - "dispatchWebhook lifecycle: dedup -> contact resolve -> payload build -> log pending -> deliver -> mark complete/failed"
  - "detectAndDispatchMilestones: fire-and-forget with try/catch per dispatch"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 22 Plan 01: WebhookDispatcher and MilestoneDetector Summary

**WebhookDispatcher with typed payloads for 5 event types, dedup detection, and MilestoneDetector with module/course completion checks plus admin-configurable milestone lessons**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T05:25:02Z
- **Completed:** 2026-01-31T05:27:52Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- WebhookDispatcher handles full lifecycle: dedup check, contact resolution, payload build, pending log, delivery, status update
- MilestoneDetector orchestrates milestone lesson, module completion, and course completion detection
- Reuses existing checkCourseCompletion from certificates.ts (no reimplementation)
- Duplicate detection prevents same webhook from firing twice within 1 hour
- Unlinked GHL contacts gracefully skipped with audit log entry

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WebhookDispatcher service** - `7b73872` (feat)
2. **Task 2: Create MilestoneDetector service** - `8884315` (feat)

## Files Created/Modified
- `src/lib/ghl/webhooks.ts` - WebhookDispatcher: dispatchWebhook, deliverWebhook, deliverWebhookFromEvent, typed payloads
- `src/lib/ghl/milestones.ts` - MilestoneDetector: checkModuleCompletion, getMilestoneLessonIds, detectAndDispatchMilestones

## Decisions Made
- Tag naming uses `lms:` prefix (e.g., `lms:module.completed`) for clear LMS ownership in GHL
- Optional `GHL_WEBHOOK_URL` env var supports full payload delivery alongside tag addition for flexible GHL automation
- 5-minute in-memory cache for milestone lesson IDs avoids querying ghl_field_mappings on every progress update
- `userEmail` optional param in dispatchWebhook lets callers skip redundant users table lookup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required (GHL credentials already configured in Phase 21).

## Next Phase Readiness
- WebhookDispatcher and MilestoneDetector ready for integration into progress route (Plan 02)
- deliverWebhookFromEvent ready for cron retry route (Plan 03)
- All 5 event types have typed context interfaces for downstream consumers

---
*Phase: 22-outbound-webhook-events*
*Completed: 2026-01-31*
