---
phase: 49-lesson-integration-polish
plan: 02
subsystem: ui
tags: [vocabulary, bookmarks, tts, search, next.js, drizzle]

requires:
  - phase: 48-character-popup
    provides: savedVocabulary table, vocabulary API, useTTS hook
provides:
  - Saved vocabulary list page at /dashboard/vocabulary
  - Client-side search filter for vocabulary review
  - Vocabulary sidebar navigation link
affects: [49-lesson-integration-polish]

tech-stack:
  added: []
  patterns: [optimistic-delete-with-rollback, shared-tts-instance]

key-files:
  created:
    - src/app/(dashboard)/dashboard/vocabulary/page.tsx
    - src/app/(dashboard)/dashboard/vocabulary/VocabularyClient.tsx
    - src/app/(dashboard)/dashboard/vocabulary/loading.tsx
  modified:
    - src/components/layout/AppSidebar.tsx

key-decisions:
  - "Single useTTS instance shared across all vocabulary cards (not per-card)"
  - "Optimistic delete with rollback on API failure for instant feedback"
  - "Client-side search filtering across traditional, simplified, pinyin, jyutping, and definitions"

patterns-established:
  - "Optimistic delete with rollback: remove from state immediately, restore on fetch failure"

duration: 3min
completed: 2026-02-09
---

# Phase 49 Plan 02: Saved Vocabulary List Summary

**Vocabulary review page with search filter, TTS playback, and optimistic delete at /dashboard/vocabulary**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T02:29:43Z
- **Completed:** 2026-02-09T02:32:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created saved vocabulary list page with server-side auth and data fetching from savedVocabulary table
- Built client component with real-time search filter across all word fields (traditional, simplified, pinyin, jyutping, definitions)
- Integrated TTS playback, optimistic delete, and empty state guidance to the Reader
- Added Vocabulary link with Bookmark icon to sidebar navigation in the Learning section

## Task Commits

Each task was committed atomically:

1. **Task 1: Create vocabulary list page with server-side data fetch and client component** - `c92eff9` (feat)
2. **Task 2: Add Vocabulary link to sidebar navigation** - `60e87be` (feat)

## Files Created/Modified
- `src/app/(dashboard)/dashboard/vocabulary/page.tsx` - Server component with auth guard querying savedVocabulary table
- `src/app/(dashboard)/dashboard/vocabulary/VocabularyClient.tsx` - Client component with search, TTS, delete, empty state
- `src/app/(dashboard)/dashboard/vocabulary/loading.tsx` - Loading skeleton following project convention
- `src/components/layout/AppSidebar.tsx` - Added Vocabulary nav item with Bookmark icon after Reader

## Decisions Made
- Single useTTS instance shared across all vocabulary cards to prevent multiple audio instances
- Optimistic delete removes item from state immediately, rolls back on API failure
- Client-side search filters across all text fields for instant results without API round-trip
- Empty state provides direct CTA link to the Reader where words are bookmarked

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Vocabulary page complete and accessible from sidebar navigation
- Ready for remaining Phase 49 plans (49-03 lesson text seeding, 49-04 final polish)

---
*Phase: 49-lesson-integration-polish*
*Completed: 2026-02-09*
