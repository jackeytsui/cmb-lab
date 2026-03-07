---
phase: 53-playback-practice-controls
plan: 01
subsystem: ui
tags: [youtube-iframe-api, playback-speed, dual-subtitles, english-captions, subtitle-overlay]

# Dependency graph
requires:
  - phase: 52-02
    provides: "TranscriptToolbar with annotation mode, script mode, and vocab stats controls"
  - phase: 51-02
    provides: "useVideoSync hook with caption sync, TranscriptPanel with interactive word spans"
provides:
  - "Playback speed control (0.5x-2x) via YouTube IFrame API setPlaybackRate"
  - "currentTimeMs exposed from useVideoSync for subtitle overlay sync"
  - "extractEnglishCaptions function for optional English caption extraction"
  - "DualSubtitleOverlay component with independent Chinese/English toggle"
  - "Speed selector and CN/EN subtitle toggle buttons in TranscriptToolbar"
  - "pauseVideo/playVideo callbacks exported from useVideoSync"
affects: [section-loop-mode, auto-pause, tts-per-line, practice-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "currentTimeMs state throttled to 200ms threshold to avoid re-render storms"
    - "findActiveCaptionIndex exported for reuse across components"
    - "DualSubtitleOverlay as YouTubePlayer child via relative container pattern"
    - "Toolbar row 2 conditionally rendered when speed control props provided"

key-files:
  created:
    - "src/components/video/DualSubtitleOverlay.tsx"
  modified:
    - "src/hooks/useVideoSync.ts"
    - "src/lib/captions.ts"
    - "src/app/api/video/extract-captions/route.ts"
    - "src/components/video/YouTubePlayer.tsx"
    - "src/components/video/TranscriptToolbar.tsx"
    - "src/app/(dashboard)/dashboard/listening/ListeningClient.tsx"

key-decisions:
  - "currentTimeMs throttled at 200ms delta to balance subtitle smoothness vs render performance"
  - "English captions stored in client state only (not DB) per research recommendation"
  - "findActiveCaptionIndex exported rather than duplicated for DualSubtitleOverlay"
  - "Toolbar speed/subtitle row conditionally rendered based on onPlaybackRateChange prop"

patterns-established:
  - "YouTubePlayer children pattern: overlay components placed as children inside relative container"
  - "Optional toolbar row: second row of controls conditionally rendered when feature props provided"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 53 Plan 01: Playback Speed Control and Dual Subtitle Overlay Summary

**Speed control via YouTube setPlaybackRate (0.5x-2x), dual Chinese/English subtitle overlay with independent toggles, and English caption extraction via youtube-transcript**

## Performance

- **Duration:** 4 min 36s
- **Started:** 2026-02-09T08:28:13Z
- **Completed:** 2026-02-09T08:32:49Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- useVideoSync extended with playbackRate, setPlaybackRate, availableRates, currentTimeMs, pauseVideo, playVideo
- New extractEnglishCaptions function tries en/en-US/en-GB language codes (gracefully returns null when unavailable)
- extract-captions API route now returns englishCaptions field in all response paths
- DualSubtitleOverlay component renders Chinese (large, white) and English (small, zinc-200) subtitles independently
- TranscriptToolbar gains second row with speed selector buttons and CN/EN subtitle toggles
- YouTubePlayer wraps content in relative container, accepts overlay children
- Full wiring in ListeningClient: speed control, subtitle state, English captions from API, overlay rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend useVideoSync + extractEnglishCaptions + API route** - `23e801e` (feat)
2. **Task 2: DualSubtitleOverlay + toolbar controls + ListeningClient wiring** - `4227aee` (feat)

## Files Created/Modified
- `src/components/video/DualSubtitleOverlay.tsx` - New dual subtitle overlay with independent Chinese/English rendering via binary search
- `src/hooks/useVideoSync.ts` - Extended with playbackRate, setPlaybackRate, availableRates, currentTimeMs, pauseVideo, playVideo; exported findActiveCaptionIndex
- `src/lib/captions.ts` - Added extractEnglishCaptions function with en/en-US/en-GB fallback
- `src/app/api/video/extract-captions/route.ts` - Returns englishCaptions field in all response paths
- `src/components/video/YouTubePlayer.tsx` - Added children prop and relative overflow-hidden container
- `src/components/video/TranscriptToolbar.tsx` - Added speed selector (Gauge icon) and subtitle toggles (Subtitles icon) in conditional second row
- `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` - Wired speed control, subtitle state, English captions, DualSubtitleOverlay

## Decisions Made
- Throttled currentTimeMs at 200ms delta threshold to avoid re-render storms while maintaining smooth subtitle sync
- Stored English captions in client state only (not persisted to DB) since they are display-only and fast to re-fetch
- Exported findActiveCaptionIndex from useVideoSync rather than duplicating the binary search in DualSubtitleOverlay
- Made toolbar second row conditional on onPlaybackRateChange prop so existing toolbar usage is backward-compatible

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Speed control and dual subtitles are complete and wired
- Ready for 53-02 (section loop mode and auto-pause) which will extend the same useVideoSync polling loop
- pauseVideo/playVideo callbacks are available for TTS coordination in 53-03
- findActiveCaptionIndex is now exported for any component needing timestamp-based caption lookup

## Self-Check: PASSED

All 7 source files verified present. Both task commits (23e801e, 4227aee) verified in git log. TypeScript compilation passes with zero errors.

---
*Phase: 53-playback-practice-controls*
*Completed: 2026-02-09*
