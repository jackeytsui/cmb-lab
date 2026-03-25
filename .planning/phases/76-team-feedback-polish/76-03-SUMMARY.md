---
phase: 76-team-feedback-polish
plan: 03
subsystem: ui
tags: [tone-colors, pinyin, jyutping, pleco, reader, flashcards, vocabulary]

# Dependency graph
requires:
  - phase: 60-reader-core
    provides: WordSpan, ReaderTextArea, ReaderToolbar, useReaderPreferences
provides:
  - Pleco-style tone color utility (src/lib/tone-colors.ts)
  - Per-character tone coloring in Reader via WordSpan toneColorsEnabled prop
  - ToneColoredText reusable component for standalone Chinese text
  - Tone coloring in flashcards and vocabulary list
affects: [reader, flashcards, vocabulary, coaching-notes, accelerator-passages]

# Tech tracking
tech-stack:
  added: []
  patterns: [tone-color-extraction-from-diacritics, per-character-color-class-mapping]

key-files:
  created:
    - src/lib/tone-colors.ts
    - src/components/ToneColoredText.tsx
  modified:
    - src/components/reader/WordSpan.tsx
    - src/components/reader/ReaderToolbar.tsx
    - src/components/reader/ReaderTextArea.tsx
    - src/hooks/useReaderPreferences.ts
    - src/app/(dashboard)/dashboard/reader/ReaderClient.tsx
    - src/app/(dashboard)/dashboard/flashcards/FlashcardsClient.tsx
    - src/app/(dashboard)/dashboard/vocabulary/VocabularyClient.tsx

key-decisions:
  - "Pleco color scheme: T1 red, T2 green, T3 blue, T4 purple, neutral grey for Mandarin; 6 distinct colors for Cantonese"
  - "Tone colors off by default, toggled via Palette button in ReaderToolbar and persisted in localStorage"
  - "WordSpan change cascades automatically to coaching notes, accelerator passages, and YouTube transcripts"

patterns-established:
  - "tone-color-utility: Centralized tone extraction and color mapping in src/lib/tone-colors.ts"
  - "ToneColoredText: Reusable component for standalone tone-colored Chinese text outside Reader context"

requirements-completed: [FB-07]

# Metrics
duration: 6min
completed: 2026-03-25
---

# Phase 76 Plan 03: Tone-Colored Characters Summary

**Pleco-style per-character tone coloring across Reader, flashcards, and vocabulary using pinyin diacritic extraction and Tailwind color classes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-25T14:04:07Z
- **Completed:** 2026-03-25T14:10:22Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created tone color utility with Mandarin 4-tone and Cantonese 6-tone Pleco color schemes
- Integrated per-character tone coloring into WordSpan (cascades to Reader, coaching notes, accelerator passages, YouTube transcripts)
- Added Palette toggle button in ReaderToolbar with localStorage persistence
- Applied tone coloring to flashcard grid/study mode and vocabulary list via reusable ToneColoredText component

## Task Commits

Each task was committed atomically:

1. **Task 1: Tone Color Utility + WordSpan Integration + Reader Toolbar Toggle** - `45e324f` (feat)
2. **Task 2: Flashcards + Vocabulary Tone Coloring** - `915eb12` (feat)

## Files Created/Modified
- `src/lib/tone-colors.ts` - Tone color maps, extraction functions for pinyin diacritics/numbers and jyutping
- `src/components/ToneColoredText.tsx` - Reusable component for tone-colored Chinese text display
- `src/components/reader/WordSpan.tsx` - Added toneColorsEnabled prop with per-character color application
- `src/components/reader/ReaderToolbar.tsx` - Added Palette toggle button for tone colors
- `src/components/reader/ReaderTextArea.tsx` - Thread toneColorsEnabled to WordSpan
- `src/hooks/useReaderPreferences.ts` - Added toneColorsEnabled preference with localStorage persistence
- `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` - Wire toneColorsEnabled through toolbar and text area
- `src/app/(dashboard)/dashboard/flashcards/FlashcardsClient.tsx` - Tone-colored card fronts and backs
- `src/app/(dashboard)/dashboard/vocabulary/VocabularyClient.tsx` - Tone-colored traditional characters

## Decisions Made
- Used Pleco standard color scheme (widely recognized by Chinese learners)
- Tone colors default to off to avoid overwhelming new users; toggle persists in localStorage
- Created separate ToneColoredText component for flashcards/vocabulary since they don't use WordSpan
- Mandarin tones preferred when both pinyin and jyutping are shown; Cantonese tones used when only jyutping active

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tone coloring automatically cascades to all pages using ReaderClient/WordSpan
- ToneColoredText component available for any future Chinese text display needs

---
*Phase: 76-team-feedback-polish*
*Completed: 2026-03-25*

## Self-Check: PASSED
