---
phase: 48-character-popup
plan: 02
subsystem: ui
tags: [popup, components, hanzi-writer, tone-comparison, radical, stroke-animation, vocabulary, bookmark]

# Dependency graph
requires:
  - phase: 48-character-popup
    plan: 01
    provides: "useCharacterPopup hook with DictionaryEntry, CharacterDetailData types and vocabulary toggle"
  - phase: 46-tts-api
    provides: "useTTS hook for speak/stop with isLoading/isPlaying state"
  - phase: 45-dictionary-data
    provides: "Dictionary API responses (lookup, character detail, examples)"
provides:
  - "PopupHeader component with word display, definitions, pinyin, jyutping, source badge, TTS buttons"
  - "ToneComparison component with per-character side-by-side Mandarin/Cantonese tone layout"
  - "RadicalBreakdown component with radical, decomposition, etymology display"
  - "StrokeAnimation component wrapping HanziWriter with play/pause/replay controls"
  - "ExampleWords component listing common words from character API"
  - "SaveVocabularyButton component with filled/unfilled bookmark toggle"
affects: [48-character-popup]

# Tech tracking
tech-stack:
  added: []
  patterns: [hanziwriter-react-useref-useeffect, per-character-tone-extraction, etymology-type-badge]

key-files:
  created:
    - src/components/reader/popup/PopupHeader.tsx
    - src/components/reader/popup/ToneComparison.tsx
    - src/components/reader/popup/RadicalBreakdown.tsx
    - src/components/reader/popup/StrokeAnimation.tsx
    - src/components/reader/popup/ExampleWords.tsx
    - src/components/reader/popup/SaveVocabularyButton.tsx
  modified: []

key-decisions:
  - "HanziWriter hideCharacter() before animateCharacter() for clean replay (instead of just re-calling animateCharacter)"
  - "pinyin-pro toneType:'num' for tone comparison extraction, separate toneType:'symbol' for display"
  - "Tone matching compares only tone number (not syllable), highlights with emerald underline"
  - "StrokeAnimation returns null for multi-character words (guard via [...character].length === 1)"

patterns-established:
  - "HanziWriter in React: useRef for container + writerRef, useEffect keyed on character, innerHTML clear before create, null ref on cleanup"
  - "Etymology type badge: color-coded by type (emerald=pictographic, violet=ideographic, blue=pictophonetic)"
  - "Source badge pattern: cedict=amber, canto=cyan, both=zinc — consistent with annotation color scheme"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 48 Plan 02: Popup Sub-Components Summary

**Six popup sub-components for character dictionary display: header with TTS, tone comparison grid, radical/etymology breakdown, HanziWriter stroke animation, example words list, and vocabulary bookmark button**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T00:55:33Z
- **Completed:** 2026-02-09T00:59:02Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments
- PopupHeader displaying word, pinyin (amber), jyutping (cyan), definitions, source badge, and dual TTS buttons with loading/playing state
- ToneComparison generating per-character pinyin and jyutping dynamically via pinyin-pro and to-jyutping, with matching tone number highlighting
- RadicalBreakdown with radical display, decomposition string, etymology type badge, and pictophonetic semantic/phonetic detail
- StrokeAnimation wrapping HanziWriter with proper React lifecycle management (create/destroy on character change, play/pause/replay controls)
- ExampleWords showing up to 8 examples with truncated definitions
- SaveVocabularyButton with filled/unfilled bookmark icon, loading spinner, and optimistic toggle interface

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PopupHeader, ToneComparison, and RadicalBreakdown** - `7b2b19a` (feat)
2. **Task 2: Create StrokeAnimation, ExampleWords, and SaveVocabularyButton** - `d840610` (feat)

## Files Created/Modified
- `src/components/reader/popup/PopupHeader.tsx` - Word display with definitions, pinyin, jyutping, source badge, dual TTS buttons
- `src/components/reader/popup/ToneComparison.tsx` - Per-character side-by-side Mandarin/Cantonese tone grid with matching highlights
- `src/components/reader/popup/RadicalBreakdown.tsx` - Radical, decomposition, etymology type badge, semantic/phonetic components
- `src/components/reader/popup/StrokeAnimation.tsx` - HanziWriter wrapper with play/pause/replay controls and React lifecycle management
- `src/components/reader/popup/ExampleWords.tsx` - Compact example words list with pinyin and definitions
- `src/components/reader/popup/SaveVocabularyButton.tsx` - Bookmark toggle button with filled/unfilled icon and loading state

## Decisions Made
- Used `hideCharacter()` before `animateCharacter()` for replay to provide a clean visual reset rather than just re-calling animateCharacter
- Used pinyin-pro with `toneType: "num"` for tone comparison extraction (needed numeric tone numbers) and default `toneType` for display (tone marks)
- Tone matching compares only the trailing tone number, not the full syllable -- highlights matching tones with an emerald underline decoration
- StrokeAnimation returns null (renders nothing) for multi-character words since HanziWriter only supports single characters

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 sub-components ready for composition into the CharacterPopup shell (Plan 48-03)
- Components accept props matching the types exported from useCharacterPopup hook
- HanziWriter integration verified with proper React lifecycle management
- Tone comparison uses same pinyin-pro/to-jyutping pattern already proven in WordSpan

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 48-character-popup*
*Completed: 2026-02-09*
