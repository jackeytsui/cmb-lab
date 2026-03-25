---
phase: 76-team-feedback-polish
plan: 04
subsystem: ui
tags: [tone-colors, chinese-text, reader, coaching, dictionary-popup]

requires:
  - phase: 76-03
    provides: "ToneColoredText component, toneColorsEnabled in useReaderPreferences, WordSpan tone coloring"
provides:
  - "Tone-colored characters in coaching notes via ReaderTextArea toneColorsEnabled prop"
  - "Tone-colored word display in dictionary popup header via ToneColoredText"
  - "toneColorsEnabled threaded through CharacterPopup from Reader and Listening clients"
affects: []

tech-stack:
  added: []
  patterns:
    - "Thread toneColorsEnabled from useReaderPreferences through component trees"

key-files:
  created: []
  modified:
    - src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx
    - src/components/reader/popup/PopupHeader.tsx
    - src/components/reader/CharacterPopup.tsx
    - src/app/(dashboard)/dashboard/reader/ReaderClient.tsx
    - src/app/(dashboard)/dashboard/listening/ListeningClient.tsx

key-decisions:
  - "Used default scope useReaderPreferences() (no scope key) so coaching shares Reader toggle"
  - "Added toneColorsEnabled to ListeningClient CharacterPopup for consistency"

patterns-established: []

requirements-completed: [FB-07]

duration: 5min
completed: 2026-03-25
---

# Phase 76 Plan 04: Tone Colors Gap Closure Summary

**Tone-colored characters wired into coaching notes (3 ReaderTextArea instances) and dictionary popup header (ToneColoredText in PopupHeader) completing FB-07 across all surfaces**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T14:50:36Z
- **Completed:** 2026-03-25T14:56:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Coaching notes now render Chinese characters with per-character tone colors when the user enables tone colors in Reader preferences
- Dictionary popup header displays tone-colored word text using ToneColoredText component with pinyin/jyutping from the DictionaryEntry
- Both Reader and Listening Lab dictionary popups receive toneColorsEnabled for consistent behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread toneColorsEnabled into coaching note ReaderTextArea instances** - `24e3de9` (feat)
2. **Task 2: Add tone-colored word display to dictionary popup header** - `640964f` (feat)

## Files Created/Modified
- `src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx` - Added useReaderPreferences hook to NoteCard and CoachingPanel, passed toneColorsEnabled to 3 ReaderTextArea instances
- `src/components/reader/popup/PopupHeader.tsx` - Added ToneColoredText import, toneColorsEnabled prop, conditional tone-colored word rendering
- `src/components/reader/CharacterPopup.tsx` - Added toneColorsEnabled prop to interface and threaded to PopupHeader
- `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` - Passed toneColorsEnabled to CharacterPopup
- `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` - Added useReaderPreferences hook and passed toneColorsEnabled to CharacterPopup

## Decisions Made
- Used default scope `useReaderPreferences()` (no scope key) so coaching notes share the same toggle as the Reader -- when a user enables tone colors via the Reader toolbar Palette button, coaching notes also get tone-colored automatically
- Extended tone coloring to ListeningClient's CharacterPopup for consistency even though the plan noted it as lower priority

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added toneColorsEnabled to ListeningClient CharacterPopup**
- **Found during:** Task 2
- **Issue:** ListeningClient's CharacterPopup would not show tone colors in dictionary popups, creating inconsistent behavior
- **Fix:** Added useReaderPreferences hook import and call, passed toneColorsEnabled to CharacterPopup
- **Files modified:** src/app/(dashboard)/dashboard/listening/ListeningClient.tsx
- **Verification:** grep confirms toneColorsEnabled prop present
- **Committed in:** 640964f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for consistent UX across all dictionary popup surfaces. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FB-07 tone coloring is now complete across all surfaces: Reader, flashcards, vocabulary, coaching notes, and dictionary popups
- SC7 from verification is fully satisfied

---
*Phase: 76-team-feedback-polish*
*Completed: 2026-03-25*
