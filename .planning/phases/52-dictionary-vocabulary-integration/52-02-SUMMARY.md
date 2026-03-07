---
phase: 52-dictionary-vocabulary-integration
plan: 02
subsystem: ui
tags: [opencc-js, transcript-toolbar, vocab-highlighting, annotation-mode, script-conversion, segmenter]

# Dependency graph
requires:
  - phase: 52-01
    provides: "Interactive transcript words with hover/tap dictionary popup, annotationMode prop threading"
  - phase: 48-reader-dictionary
    provides: "WordSpan, CharacterPopup, useCharacterPopup, convertScript, segmentText"
provides:
  - "TranscriptToolbar with annotation mode, script mode, and vocab stats controls"
  - "T/S script conversion for transcript captions via opencc-js"
  - "Dual-key savedVocabMap (traditional + simplified) for cross-script vocab matching"
  - "Vocabulary highlighting in transcript (emerald visual indicator on known words)"
  - "Known/unknown word count computation from segmented transcript text"
affects: [listening-lab-enhancements, vocabulary-review, practice-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-key Map pattern for cross-script vocabulary lookup"
    - "T/S conversion useEffect with cancelled flag for caption arrays"
    - "useMemo vocab stats computation from segmented text + savedVocabMap"
    - "TranscriptToolbar as external header replacing panel-internal header"

key-files:
  created:
    - "src/components/video/TranscriptToolbar.tsx"
  modified:
    - "src/app/api/vocabulary/route.ts"
    - "src/hooks/useCharacterPopup.ts"
    - "src/components/video/TranscriptLine.tsx"
    - "src/components/video/TranscriptPanel.tsx"
    - "src/app/(dashboard)/dashboard/listening/ListeningClient.tsx"

key-decisions:
  - "Dual-key Map instead of separate lookups for cross-script vocab matching"
  - "TranscriptToolbar placed in ListeningClient above TranscriptPanel, replacing internal header"
  - "Vocab stats computed from unique segmented words (not raw character count)"

patterns-established:
  - "Dual-key savedVocabMap: set both traditional and simplified keys for O(1) cross-script lookup"
  - "Toolbar-as-external-header: toolbar rendered by parent, panel is headerless scrollable content"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 52 Plan 02: Transcript Toolbar with Annotation/Script Mode, Vocab Highlighting, and Word Count Summary

**TranscriptToolbar with pinyin/jyutping annotation toggle, T/S script conversion via opencc-js, emerald vocab highlighting, and reactive known/unknown word count badge**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T07:30:34Z
- **Completed:** 2026-02-09T07:34:41Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Vocabulary API expanded to return simplified form, enabling cross-script vocab matching
- useCharacterPopup builds dual-key Map (traditional + simplified) so isSaved() works regardless of display script
- New TranscriptToolbar component provides compact annotation mode (plain/pinyin/jyutping), script mode (original/simplified/traditional), and vocab stats controls
- T/S conversion wired in ListeningClient following the ReaderClient async conversion pattern
- Vocabulary highlight styling (emerald bg + border) on known words in TranscriptLine
- Reactive word count computed via useMemo from segmented display texts and savedVocabMap

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand vocabulary API + dual-key savedVocabMap + TranscriptToolbar** - `3465a91` (feat)
2. **Task 2: T/S conversion, vocab highlighting, toolbar wiring, word count** - `5bd92df` (feat)

## Files Created/Modified
- `src/components/video/TranscriptToolbar.tsx` - New toolbar with annotation mode, script mode, and vocab stats controls
- `src/app/api/vocabulary/route.ts` - GET handler now returns simplified alongside traditional
- `src/hooks/useCharacterPopup.ts` - Dual-key savedVocabMap, exposed in return object
- `src/components/video/TranscriptLine.tsx` - savedVocabSet prop with emerald highlight wrapper on known words
- `src/components/video/TranscriptPanel.tsx` - displayTexts and savedVocabSet props, header removed
- `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` - Full integration: toolbar, T/S conversion, vocab stats, savedVocabSet

## Decisions Made
- Used dual-key Map (both traditional and simplified as keys) for O(1) cross-script vocabulary lookup, avoiding separate lookups or conversion at check time
- Placed TranscriptToolbar in ListeningClient as external header above TranscriptPanel, removing the internal "Transcript" header from TranscriptPanel to avoid duplication
- Computed vocab stats from unique segmented words (Set) rather than raw character counts for accurate word-level statistics

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 52 is complete: dictionary popup, annotation modes, script conversion, and vocab highlighting all wired
- Ready for Phase 53 (or subsequent phases building on the Listening Lab)
- All vocabulary features (save/unsave, cross-script matching, stats) are reactive and immediately update UI

## Self-Check: PASSED

All 6 source files verified present. Both task commits (3465a91, 5bd92df) verified in git log. TypeScript compilation passes with zero errors.

---
*Phase: 52-dictionary-vocabulary-integration*
*Completed: 2026-02-09*
