---
phase: 58-student-player-foundation
plan: 01
subsystem: database, api
tags: [drizzle, postgres, video-threads, sessions, responses, clerk-auth]

# Dependency graph
requires:
  - phase: 57-builder-completion
    provides: "videoThreads + videoThreadSteps schema, Mux upload integration"
provides:
  - "video_thread_sessions table for tracking student attempts"
  - "video_thread_responses table for storing step-level responses"
  - "Student-facing GET /api/video-threads/[threadId] endpoint"
  - "Refactored POST respond with session creation + response storage"
affects: [58-02-player-ui, 60-session-coach, 61-assignments]

# Tech tracking
tech-stack:
  added: []
  patterns: ["session-on-first-response (lazy session creation)", "student-accessible API routes (no role gate)"]

key-files:
  created:
    - src/app/api/video-threads/[threadId]/route.ts
  modified:
    - src/db/schema/video-threads.ts
    - src/app/api/video-threads/[threadId]/respond/route.ts

key-decisions:
  - "Lazy session creation: session is created on first POST respond, not on page load"
  - "Student GET returns flattened { thread, steps } for easier client consumption"
  - "Reuse existing responseTypeEnum for video_thread_responses.response_type column"

patterns-established:
  - "Student API routes: authenticate via getCurrentUser, no role check, return 401 if not logged in"
  - "Session-per-thread: one session tracks all responses for a student's attempt"

# Metrics
duration: 2m 28s
completed: 2026-02-14
---

# Phase 58 Plan 01: Response Storage Schema + Student API Summary

**Two new DB tables (sessions + responses) with student-facing GET thread endpoint and session-aware respond POST**

## Performance

- **Duration:** 2m 28s
- **Started:** 2026-02-14T05:31:00Z
- **Completed:** 2026-02-14T05:33:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- video_thread_sessions table with status enum (in_progress/completed/abandoned), timestamps, and composite index on (threadId, studentId)
- video_thread_responses table with FK to sessions + steps, reusing existing responseTypeEnum, indexes on sessionId and stepId
- Student-facing GET endpoint that returns thread + steps + upload data without requiring coach/admin role
- Refactored POST respond that creates sessions on first submission, stores every response, preserves full logic engine traversal, and marks sessions completed when thread ends

## Task Commits

Each task was committed atomically:

1. **Task 1: Add video_thread_sessions and video_thread_responses tables to schema** - `a45d9dc` (feat)
2. **Task 2: Create student GET route and refactor respond POST with session/response storage** - `901c548` (feat)

## Files Created/Modified
- `src/db/schema/video-threads.ts` - Added sessionStatusEnum, videoThreadSessions table, videoThreadResponses table, relations for both, and exported types
- `src/app/api/video-threads/[threadId]/route.ts` - New student-facing GET endpoint with Clerk auth, returns thread + steps with upload data
- `src/app/api/video-threads/[threadId]/respond/route.ts` - Refactored to require auth, handle session creation/reuse, store responses, and track completion

## Decisions Made
- **Lazy session creation:** Sessions are created when the student submits their first response (not on page load). This avoids orphan sessions from users who navigate away without interacting.
- **Flattened GET response:** The student GET returns `{ thread, steps }` with steps flattened out of the thread object for easier client consumption, matching what the player UI will expect.
- **Reuse responseTypeEnum:** The video_thread_responses table reuses the existing responseTypeEnum rather than creating a separate enum, keeping the schema consistent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

Database migration required. Run `npm run db:push` or `npm run db:generate` to apply the new tables (video_thread_sessions, video_thread_responses) and session_status enum.

## Next Phase Readiness
- Schema and API layer complete for Plan 02 (player UI) to consume
- GET endpoint provides thread + steps data that the player component will fetch
- POST respond returns sessionId + completed flag for client state management
- All TypeScript types compile cleanly

## Self-Check: PASSED

- [x] src/db/schema/video-threads.ts - FOUND
- [x] src/app/api/video-threads/[threadId]/route.ts - FOUND
- [x] src/app/api/video-threads/[threadId]/respond/route.ts - FOUND
- [x] Commit a45d9dc - FOUND
- [x] Commit 901c548 - FOUND

---
*Phase: 58-student-player-foundation*
*Completed: 2026-02-14*
