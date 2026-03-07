---
phase: 49-lesson-integration-polish
plan: 03
subsystem: ui
tags: [tts, translation, openai, ai-sdk, chinese-reader, sentence-detection]

# Dependency graph
requires:
  - phase: 46-tts-audio
    provides: "useTTS hook and /api/tts endpoint for audio playback"
  - phase: 47-reader-interface
    provides: "ReaderTextArea, ReaderClient, segmenter, WordSpan components"
provides:
  - "Sentence detection utility (detectSentences) for Chinese text boundary splitting"
  - "AI translation API route (/api/reader/translate) with gpt-4o-mini"
  - "SentenceControls component with TTS play/speed/translate buttons"
  - "Sentence-grouped ReaderTextArea with per-sentence controls"
affects: [49-lesson-integration-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [sentence-boundary-detection, client-side-translation-cache, sentence-level-tts]

key-files:
  created:
    - src/lib/sentences.ts
    - src/app/api/reader/translate/route.ts
    - src/components/reader/SentenceControls.tsx
  modified:
    - src/components/reader/ReaderTextArea.tsx
    - src/app/(dashboard)/dashboard/reader/ReaderClient.tsx
    - src/app/globals.css

key-decisions:
  - "SENTENCE_TERMINATORS includes both Chinese and Western punctuation: /[。！？；.!?;]/"
  - "Max sentence length 100 chars for TTS limit — oversized sentences split at nearest non-word segment boundary"
  - "Translation cache is parent-level Map<string, string> passed as props (not per-component state)"
  - "SentenceControls renders inline (span) at end of each sentence for natural text flow"
  - "fadeIn keyframe added to globals.css for translation reveal animation"

patterns-established:
  - "Sentence detection: walk segments array, split at terminators, handle trailing text"
  - "Parent-level cache pattern: Map state in parent, check before fetch, update via callback"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 49 Plan 03: Sentence TTS & Translation Summary

**Per-sentence TTS read-aloud with speed control and AI-powered tap-to-reveal English translation via gpt-4o-mini**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T02:35:00Z
- **Completed:** 2026-02-09T02:39:51Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Sentence boundary detection utility that splits Chinese text at terminators with oversized sentence handling
- AI translation API route with Clerk auth, input validation (non-empty, <= 500 chars), and gpt-4o-mini
- SentenceControls component with play/stop button, slow/normal/fast speed selector, and translate toggle
- ReaderTextArea refactored from flat segment list to sentence-grouped rendering with inline controls
- ReaderClient wired with useTTS, useLanguagePreference, and client-side translation cache

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sentence detection utility and AI translation API route** - `b081766` (feat)
2. **Task 2: Create SentenceControls component and integrate into ReaderTextArea** - `1bd3ddf` (feat)

## Files Created/Modified
- `src/lib/sentences.ts` - Sentence boundary detection with SentenceRange interface and detectSentences()
- `src/app/api/reader/translate/route.ts` - POST endpoint for AI sentence translation via gpt-4o-mini
- `src/components/reader/SentenceControls.tsx` - Per-sentence TTS play, speed control, and translate toggle
- `src/components/reader/ReaderTextArea.tsx` - Refactored to sentence-grouped rendering with SentenceControls
- `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` - Wired useTTS, useLanguagePreference, translation cache
- `src/app/globals.css` - Added fadeIn keyframe animation for translation reveal

## Decisions Made
- Sentence terminators include semicolons (Chinese and Western) for clause-level splitting
- Max sentence length of 100 characters with split at nearest non-word segment boundary
- Translation cache uses parent-level Map state with new Map() creation on update for React re-render
- SentenceControls renders as inline span elements to maintain natural text flow
- TTS language derived from useLanguagePreference: cantonese -> zh-HK, mandarin/both -> zh-CN
- Translation visibility toggles independently per sentence (cached check before fetch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added fadeIn keyframe to globals.css**
- **Found during:** Task 2
- **Issue:** SentenceControls uses `animate-[fadeIn_200ms_ease-out_forwards]` for translation reveal but no fadeIn keyframe existed
- **Fix:** Added @keyframes fadeIn with opacity 0->1 and translateY -4px->0 to globals.css
- **Files modified:** src/app/globals.css
- **Verification:** Build passes, animation class resolves
- **Committed in:** 1bd3ddf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor CSS addition required for planned animation to work. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. OpenAI API key is already configured.

## Next Phase Readiness
- Sentence-level TTS and translation are fully functional in the reader
- Translation cache prevents redundant API calls
- Ready for Phase 49 Plan 4 (final polish and testing)

---
*Phase: 49-lesson-integration-polish*
*Completed: 2026-02-09*
