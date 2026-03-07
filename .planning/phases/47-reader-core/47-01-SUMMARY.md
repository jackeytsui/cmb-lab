---
phase: 47-reader-core
plan: 01
subsystem: lib, hooks, api
tags: [intl-segmenter, pinyin-pro, opencc-js, jschardet, tone-sandhi, localStorage]

# Dependency graph
requires:
  - phase: 44-dictionary-data
    provides: pinyin-pro and opencc-js packages installed
  - phase: 46-tts-integration
    provides: established pattern for lib utilities with lazy loading
provides:
  - segmentText() for Chinese word-level tokenization via Intl.Segmenter
  - applyThirdToneSandhi() and getPinyinWithSandhi() for Mandarin tone sandhi
  - convertScript() for T/S conversion with lazy opencc-js loading
  - useReaderPreferences hook for localStorage-backed reader settings
  - POST /api/reader/import for PDF and text file import with encoding detection
affects: [47-reader-core plan 02 (reader UI), 48-popup-dictionary]

# Tech tracking
tech-stack:
  added: [jschardet (encoding detection)]
  patterns: [lazy dynamic import for heavy libraries, right-to-left tone sandhi]

key-files:
  created:
    - src/lib/segmenter.ts
    - src/lib/tone-sandhi.ts
    - src/lib/chinese-convert.ts
    - src/hooks/useReaderPreferences.ts
    - src/app/api/reader/import/route.ts

key-decisions:
  - "opencc-js loaded via dynamic import() to avoid 2MB eager bundle"
  - "Third-tone sandhi uses right-to-left pairing — standard computational approach for 3+ consecutive tones"
  - "jschardet named import {detect} for TypeScript compat (CJS module with named .d.ts exports)"
  - "ScriptMode uses HK variant (from:'hk' to:'cn' and from:'cn' to:'hk') for Cantonese context"

patterns-established:
  - "Lazy converter memoization: module-level null variables + dynamic import on first call"
  - "Encoding detection fallback chain: try UTF-8 → check CJK → jschardet detect → re-decode"
  - "Font size clamping in setter (Math.max/min) rather than at render time"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 47 Plan 01: Reader Core Utilities Summary

**Intl.Segmenter wrapper, third-tone sandhi with pinyin-pro, opencc-js lazy T/S conversion, localStorage preferences hook, and file import API with encoding detection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T13:21:08Z
- **Completed:** 2026-02-08T13:26:30Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Chinese word segmentation via Intl.Segmenter with WordSegment type and isWordLike fallback
- Third-tone sandhi correctly transforms consecutive third tones (verified: 你好 -> ni2 hao3 -> ní hǎo)
- opencc-js converter memoized with lazy dynamic import to avoid 2MB bundle impact
- Reader preferences hook persists annotation mode, script mode, and font size to localStorage
- File import API handles PDF text extraction, encoding detection (UTF-8/GBK/Big5), CJK validation, and 20K truncation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create segmenter, tone-sandhi, and chinese-convert utility libraries** - `670a978` (feat)
2. **Task 2: Create useReaderPreferences hook and POST /api/reader/import endpoint** - `0d7095b` (feat)

## Files Created
- `src/lib/segmenter.ts` - Intl.Segmenter wrapper exporting segmentText() and WordSegment
- `src/lib/tone-sandhi.ts` - Third-tone sandhi using pinyin-pro numbered pinyin + convert()
- `src/lib/chinese-convert.ts` - opencc-js wrapper with lazy init, HK variant, ScriptMode type
- `src/hooks/useReaderPreferences.ts` - localStorage-backed preferences following useSubtitlePreference pattern
- `src/app/api/reader/import/route.ts` - POST endpoint for PDF/text import with encoding detection

## Decisions Made
- Used `{detect}` named import from jschardet (not default import) because the package's .d.ts only exports named members
- opencc-js cast to `any` for dynamic import since the package ships no TypeScript declarations
- Encoding detection runs server-side in the API route (not client-side) to avoid Buffer polyfill bundle cost
- pinyin-pro `convert()` handles tone 0 (neutral) correctly, no special stripping needed (returns 'de' for 'de0')

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All five utility files ready for consumption by Plan 02 (Reader UI components)
- segmentText + tone-sandhi + chinese-convert form the processing pipeline for the reader
- useReaderPreferences provides the state management for annotation mode, script mode, font size
- File import API is ready for the ImportDialog component

## Self-Check: PASSED

- All 5 created files exist on disk
- Both task commits verified (670a978, 0d7095b)
- TypeScript compilation: zero errors
- Runtime verification: tone sandhi output matches expected results

---
*Phase: 47-reader-core*
*Completed: 2026-02-08*
