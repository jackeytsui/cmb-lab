---
phase: 54-progress-tracking
plan: 01
subsystem: database, api, ui
tags: [drizzle, progress-tracking, sendBeacon, visibilitychange, debounce, youtube, resume]

# Dependency graph
requires:
  - phase: 50-video-listening
    provides: videoSessions table, useVideoSync hook, ListeningClient, YouTubePlayer
provides:
  - videoSessions progress columns (lastPositionMs, videoDurationMs, totalWatchedMs, completionPercent)
  - videoVocabEncounters table for word encounter tracking
  - POST /api/video/progress endpoint with monotonic GREATEST() completion
  - useWatchProgress hook with 10s debounce and sendBeacon page-leave
  - Resume-from-last-position on video reload
affects: [54-02-PLAN, watch-history, vocabulary-encounters]

# Tech tracking
tech-stack:
  added: []
  patterns: [debounced-progress-save, sendBeacon-page-leave, monotonic-GREATEST, resume-from-position]

key-files:
  created:
    - src/hooks/useWatchProgress.ts
    - src/app/api/video/progress/route.ts
    - src/db/migrations/0013_nostalgic_radioactive_man.sql
  modified:
    - src/db/schema/video.ts
    - src/app/(dashboard)/dashboard/listening/ListeningClient.tsx

key-decisions:
  - "Store player ref locally in ListeningClient for getDuration/getVideoData access since onPlay callback doesn't receive player"
  - "Use Blob with application/json type for sendBeacon to ensure correct Content-Type header"
  - "Resume position stored in ref from extract-captions response and applied in wrappedHandlePlayerReady"

patterns-established:
  - "useWatchProgress pattern: debounced save + sendBeacon backup on visibilitychange"
  - "Monotonic completion via SQL GREATEST() in progress updates"
  - "Player ref forwarding: wrappedHandlePlayerReady captures player ref for duration/title extraction"

# Metrics
duration: 8m 18s
completed: 2026-02-09
---

# Phase 54 Plan 01: Watch Progress Persistence Summary

**Debounced watch progress saves every 10s with sendBeacon page-leave backup, SQL GREATEST() monotonic completion, and resume-from-last-position on reload**

## Performance

- **Duration:** 8m 18s
- **Started:** 2026-02-09T09:10:05Z
- **Completed:** 2026-02-09T09:18:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extended videoSessions schema with 4 progress columns (lastPositionMs, videoDurationMs, totalWatchedMs, completionPercent)
- Created videoVocabEncounters table with session FK, word uniqueness constraint, and proper indexes
- Built POST /api/video/progress with dual content-type handling (JSON + sendBeacon text/plain), GREATEST() monotonic completion, and first-title-capture logic
- Created useWatchProgress hook with 10s debounced saves and sendBeacon on visibilitychange for reliable page-leave data preservation
- Wired resume-from-last-position into ListeningClient using extract-captions session response

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration and progress API route** - `8c8f403` (feat)
2. **Task 2: useWatchProgress hook and ListeningClient wiring** - `61623e3` (feat)

## Files Created/Modified
- `src/db/schema/video.ts` - Added 4 progress columns to videoSessions, new videoVocabEncounters table, relations, and type exports
- `src/app/api/video/progress/route.ts` - POST endpoint for saving watch progress with auth, ownership check, and monotonic completion
- `src/hooks/useWatchProgress.ts` - Custom hook for debounced progress saves with sendBeacon page-leave handling
- `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` - Wired useWatchProgress, added isPlaying/videoDurationMs/videoTitle state, resume logic, duration/title capture on first play
- `src/db/migrations/0013_nostalgic_radioactive_man.sql` - Migration for progress columns and vocab encounters table

## Decisions Made
- Stored player ref locally in ListeningClient via wrappedHandlePlayerReady since the YouTubePlayer onPlay callback does not pass the player object -- needed for getDuration() and getVideoData() access
- Used Blob with explicit application/json content type for sendBeacon to ensure the API route receives parseable JSON
- Resume position captured from extract-captions response (session.lastPositionMs) and stored in a ref, applied once when player becomes ready

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

Pending migration to apply:
- Run `npm run db:migrate` to apply migration 0013 (progress columns + vocab encounters table) when DATABASE_URL is available

## Next Phase Readiness
- Progress columns ready for Plan 02 (vocabulary encounter tracking, watch history page)
- videoVocabEncounters table already created for Plan 02 to use directly
- No blockers for Phase 54 Plan 02

## Self-Check: PASSED

All 5 files verified present. Both task commits (8c8f403, 61623e3) verified in git history. Key patterns (fetch api/video/progress, GREATEST, useWatchProgress import) confirmed in target files. Hook exceeds 40-line minimum at 132 lines.

---
*Phase: 54-progress-tracking*
*Completed: 2026-02-09*
