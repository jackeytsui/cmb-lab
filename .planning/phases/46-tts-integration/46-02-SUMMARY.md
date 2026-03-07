---
phase: 46-tts-integration
plan: 02
subsystem: hooks
tags: [react-hook, tts, audio-playback, blob-cache, use-client]

# Dependency graph
requires:
  - phase: 46-tts-integration
    plan: 01
    provides: POST /api/tts endpoint that returns MP3 audio binary
provides:
  - useTTS React hook with speak, stop, isLoading, isPlaying, error
  - Client-side blob URL caching for repeated word playback
  - Overlap prevention via stop-before-play pattern
affects: [48-character-popup, 49-reader-components]

# Tech tracking
tech-stack:
  added: []
  patterns: [blob-url-cache, stop-before-play, mounted-ref-guard, useEffect-cleanup-revoke]

key-files:
  created:
    - src/hooks/useTTS.ts
  modified: []

key-decisions:
  - "Capture cacheRef.current inside useEffect per React lint rules (not in cleanup closure)"
  - "Client cache key is plain string concatenation text:language:rate:phoneme (no hashing on client)"
  - "Autoplay policy error mapped to user-friendly 'Tap to enable audio playback' message"

patterns-established:
  - "Stop-before-play: always call stop() at start of speak() to prevent audio overlap"
  - "Blob URL cache: Map<string, string> in useRef, revoked on unmount via captured variable"
  - "Mounted ref guard: check mountedRef.current before any setState after async operations"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 46 Plan 02: useTTS Client Hook Summary

**Client-side React hook for TTS playback with blob URL caching, stop-before-play overlap prevention, and full error/loading/playing state management**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T12:16:22Z
- **Completed:** 2026-02-08T12:21:13Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- useTTS hook with speak(text, options) and stop() functions consuming POST /api/tts
- Client-side blob URL cache (Map in useRef) eliminates re-fetching for repeated characters/words
- Stop-before-play pattern makes overlapping audio impossible
- Error states cover 429 rate limit, 401 auth, fetch failure, autoplay policy, and playback errors
- Blob URLs revoked on component unmount preventing memory leaks
- Full project builds and lints cleanly with all Phase 46 code (tsc, next build, eslint)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useTTS client hook** - `a3d65bc` (feat)
2. **Task 2: Verify full TTS pipeline compiles end-to-end** - `b7c4dd0` (fix)

## Files Created/Modified
- `src/hooks/useTTS.ts` - Client-side TTS hook with speak, stop, isLoading, isPlaying, error, blob URL cache, and cleanup

## Decisions Made
- Captured `cacheRef.current` into a local variable inside useEffect to satisfy React lint rule about stale refs in cleanup functions
- Client-side cache key uses plain string concatenation (no hashing) since server handles Redis cache key hashing separately
- Autoplay policy DOMException mapped to user-friendly message rather than technical error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed React lint warning for stale ref in useEffect cleanup**
- **Found during:** Task 2 (lint verification)
- **Issue:** `cacheRef.current` used directly in cleanup function triggers `react-hooks/exhaustive-deps` warning because ref value may change by cleanup time
- **Fix:** Captured `cacheRef.current` into `const cache` variable inside the effect body, then used `cache` in the cleanup function
- **Files modified:** src/hooks/useTTS.ts
- **Verification:** `npx eslint src/hooks/useTTS.ts` passes with zero warnings
- **Committed in:** b7c4dd0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor lint fix. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - hook consumes the /api/tts endpoint created in plan 01. Azure credentials are already a documented pending todo.

## Next Phase Readiness
- useTTS hook ready for consumption by Phase 48 (Character Popup) and Phase 49 (Lesson Integration)
- All Phase 46 artifacts compile and build cleanly together
- No blockers for downstream phases

## Self-Check: PASSED

All files exist, all commits verified:
- src/hooks/useTTS.ts: FOUND
- Commit a3d65bc: FOUND
- Commit b7c4dd0: FOUND

---
*Phase: 46-tts-integration*
*Completed: 2026-02-08*
