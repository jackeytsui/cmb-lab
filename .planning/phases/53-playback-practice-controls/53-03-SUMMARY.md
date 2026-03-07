---
phase: 53-playback-practice-controls
plan: 03
subsystem: ui
tags: [azure-tts, text-to-speech, transcript-interaction, audio-playback, video-pause-coordination]

# Dependency graph
requires:
  - phase: 53-01
    provides: "useTTS hook with speak/stop/isLoading/isPlaying; useVideoSync with pauseVideo/playVideo"
  - phase: 53-02
    provides: "Loop mode and auto-pause in TranscriptLine/TranscriptPanel/ListeningClient"
provides:
  - "Per-line TTS play button (Volume2/Loader2 icons) with idle/loading/playing states on every TranscriptLine"
  - "Video pause coordination: pauseVideo() called before speak() to prevent audio overlap"
  - "Per-line TTS state tracking via ttsLineIndex in ListeningClient"
  - "TTS props threaded through TranscriptPanel to TranscriptLine"
affects: [practice-quiz, pronunciation-scoring, video-listening-lab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-line state tracking: ttsLineIndex + conditional prop comparison (ttsLineIndex === index && isTtsLoading) for line-specific UI"
    - "e.stopPropagation() on TTS button prevents line seek when clicking speaker icon"
    - "Graceful degradation: TTS button only rendered when onTtsPlay is defined"

key-files:
  created: []
  modified:
    - "src/components/video/TranscriptLine.tsx"
    - "src/components/video/TranscriptPanel.tsx"
    - "src/app/(dashboard)/dashboard/listening/ListeningClient.tsx"

key-decisions:
  - "TTS button placed on right side of line for cleaner layout (not left of timestamp)"
  - "Button always visible (not hover-only) for accessibility and discoverability"
  - "flex items-start layout for TranscriptLine to align TTS button with first line of text"

patterns-established:
  - "Per-line callback threading: parent passes (index: number) => void, panel wraps as () => handler(index), line receives () => void"
  - "Conditional icon rendering: Loader2 with animate-spin for loading, Volume2 with animate-pulse for playing, Volume2 default for idle"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 53 Plan 03: Per-Line TTS Play Button Summary

**Per-line TTS play button on every transcript line with Azure TTS playback, video pause coordination, and loading/playing/idle state indicators**

## Performance

- **Duration:** 2 min 13s
- **Started:** 2026-02-09T08:42:13Z
- **Completed:** 2026-02-09T08:44:26Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Every TranscriptLine now has a TTS play button (Volume2 icon) on the right side with three visual states: idle (zinc), loading (cyan + spin), playing (cyan + pulse)
- Clicking the TTS button pauses the YouTube video via pauseVideo() before calling speak() to prevent audio overlap
- Per-line TTS state tracking ensures only the clicked line's button shows loading/playing indicators
- TTS button click uses e.stopPropagation() to prevent triggering line seek (video jump)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TTS play button to TranscriptLine, wire useTTS in ListeningClient with video pause coordination** - `919ffec` (feat)

## Files Created/Modified
- `src/components/video/TranscriptLine.tsx` - Added onTtsPlay/isTtsLoading/isTtsPlaying props; Volume2/Loader2 button with three states; flex layout for button alignment
- `src/components/video/TranscriptPanel.tsx` - Added onTtsPlay/ttsLineIndex/isTtsLoading/isTtsPlaying props; threaded to each TranscriptLine with per-line conditional comparison
- `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` - Imported useTTS hook; added ttsLineIndex state; handleTtsPlay callback with pauseVideo + speak; passed TTS props to TranscriptPanel

## Decisions Made
- Placed TTS button on the right side of each line (after text content) rather than left of timestamp for cleaner layout
- Made button always visible (not hover-only) for better accessibility and mobile discoverability
- Used flex items-start on TranscriptLine div to align the TTS button with the first line of text in multi-line captions
- Used "zh-CN" as default TTS language; future enhancement could use user's language preference

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

Azure Speech credentials required for TTS to function:
- `AZURE_SPEECH_KEY` - from Azure Portal -> Speech Services -> Keys and Endpoint
- `AZURE_SPEECH_REGION` - from Azure Portal -> Speech Services -> Keys and Endpoint

Without credentials, TTS API returns 503; the button will show brief loading then return to idle state without crashing (handled by useTTS error state).

## Next Phase Readiness
- All three practice controls are complete: playback speed (53-01), loop mode + auto-pause (53-02), per-line TTS (53-03)
- Phase 53 is fully complete -- ready for Phase 54 (quiz/checkpoint engine)
- TTS infrastructure (useTTS hook, /api/tts endpoint) available for reuse in pronunciation scoring

## Self-Check: PASSED

All 3 source files verified present. Task commit (919ffec) verified in git log. TypeScript compilation passes with zero errors.

---
*Phase: 53-playback-practice-controls*
*Completed: 2026-02-09*
