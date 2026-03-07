---
phase: 47-reader-core
plan: 02
subsystem: ui, components
tags: [ruby-annotation, pinyin-pro, to-jyutping, event-delegation, react-memo, shadcn-dialog]

# Dependency graph
requires:
  - phase: 47-reader-core plan 01
    provides: segmenter, tone-sandhi, chinese-convert utilities, useReaderPreferences hook, /api/reader/import endpoint
provides:
  - ImportDialog for text paste and file upload with encoding fallback
  - AnnotationModeSelector three-way toggle (pinyin/jyutping/plain)
  - ReaderToolbar composite control bar (import, annotation, T/S, font size)
  - WordSpan with ruby annotations for pinyin (with sandhi) and jyutping
  - ReaderTextArea with event delegation for word hover/click
affects: [47-reader-core plan 03 (page orchestrator), 48-popup-dictionary]

# Tech tracking
tech-stack:
  added: []
  patterns: [event delegation on container div, React.memo for word spans, direct JSX ruby construction]

key-files:
  created:
    - src/components/reader/ImportDialog.tsx
    - src/components/reader/AnnotationModeSelector.tsx
    - src/components/reader/ReaderToolbar.tsx
    - src/components/reader/WordSpan.tsx
    - src/components/reader/ReaderTextArea.tsx

key-decisions:
  - "Direct JSX <ruby> construction over dangerouslySetInnerHTML for type safety"
  - "Styled buttons as segmented control instead of shadcn ToggleGroup (not installed)"
  - "Script mode toggle uses click-to-toggle pattern: clicking active button reverts to original"
  - "Line height 3 for annotated text (ruby needs vertical space), 2 for plain"

patterns-established:
  - "Event delegation: single onMouseOver on container, closest('[data-word]') to find target"
  - "React.memo on WordSpan with useMemo for annotation content"
  - "Encoding fallback chain: try UTF-8 client-side -> check CJK -> upload to server API for detection"

# Metrics
duration: 3min
completed: 2026-02-08
---

# Phase 47 Plan 02: Reader UI Components Summary

**Five reader UI components: ImportDialog with paste/file tabs, AnnotationModeSelector toggle, ReaderToolbar with T/S and font controls, WordSpan with ruby pinyin/jyutping annotations, ReaderTextArea with event delegation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-08T13:31:25Z
- **Completed:** 2026-02-08T13:34:30Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- ImportDialog with paste tab (textarea + import button) and file tab (drag-and-drop zone) with encoding fallback to /api/reader/import
- AnnotationModeSelector as compact three-way segmented control with cyan-500 active accent
- ReaderToolbar composing all controls: import button, annotation mode, script mode (simplified/traditional/original), font size (14-28px in 2px steps)
- WordSpan renders per-character ruby annotations: pinyin with third-tone sandhi via applyThirdToneSandhi(), jyutping via ToJyutping.getJyutpingList()
- ReaderTextArea uses event delegation (ONE onMouseOver on container div) with data-word/data-index attribute lookup and ref-based dedup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ImportDialog, AnnotationModeSelector, and ReaderToolbar** - `5bc152f` (feat)
2. **Task 2: Create WordSpan and ReaderTextArea with event delegation** - `a8fd53c` (feat)

## Files Created
- `src/components/reader/ImportDialog.tsx` - Dialog with paste/file tabs, drag-and-drop, encoding fallback, error/warning states
- `src/components/reader/AnnotationModeSelector.tsx` - Three-way toggle for pinyin/jyutping/plain annotation modes
- `src/components/reader/ReaderToolbar.tsx` - Composite toolbar: import, annotation, T/S toggle, font size controls
- `src/components/reader/WordSpan.tsx` - Memoized word span with optional ruby annotation (pinyin with sandhi, jyutping)
- `src/components/reader/ReaderTextArea.tsx` - Segmented text display with event delegation and empty state

## Decisions Made
- Used direct JSX construction for ruby elements instead of dangerouslySetInnerHTML — better type safety with no runtime risk
- Used styled buttons for segmented controls instead of shadcn ToggleGroup (component not installed, would be scope creep to add)
- Script mode toggle uses click-to-toggle: clicking the active button (simplified or traditional) reverts to "original"
- Line height switches between 3 (annotated) and 2 (plain) to accommodate ruby text above characters

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All five reader UI components ready for Plan 03 (page orchestrator/ReaderClient)
- Components have clear prop interfaces matching useReaderPreferences hook shape
- WordSpan data-word/data-index attributes ready for Phase 48 popup dictionary integration
- Event delegation pattern in ReaderTextArea ready to be wired to dictionary lookup on hover/click

## Self-Check: PASSED

- All 5 created files exist on disk
- Both task commits verified (5bc152f, a8fd53c)
- TypeScript compilation: zero errors

---
*Phase: 47-reader-core*
*Completed: 2026-02-08*
