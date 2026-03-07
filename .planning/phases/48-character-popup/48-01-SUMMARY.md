---
phase: 48-character-popup
plan: 01
subsystem: api, ui
tags: [vocabulary, dictionary, hooks, debounce, abort-controller, floating-ui, optimistic-updates]

# Dependency graph
requires:
  - phase: 46-dictionary-data
    provides: "Dictionary entries, character data tables, lookup/character API routes"
  - phase: 47-reader-core
    provides: "Reader page, ReaderTextArea component consuming popup hook"
provides:
  - "POST/DELETE/GET /api/vocabulary endpoints for saved vocabulary CRUD"
  - "useCharacterPopup hook for popup state management, dictionary fetching, vocabulary tracking"
affects: [48-character-popup]

# Tech tracking
tech-stack:
  added: []
  patterns: [optimistic-toggle-with-rollback, debounced-fetch-with-abort, virtual-element-positioning, placeholder-id-pattern]

key-files:
  created:
    - src/app/api/vocabulary/route.ts
    - src/hooks/useCharacterPopup.ts
  modified: []

key-decisions:
  - "getCurrentUser() for Clerk-to-UUID mapping (savedVocabulary.userId is UUID, not Clerk string ID)"
  - "Optimistic save uses placeholder ID replaced with real ID on server response"
  - "Vocabulary load on mount is silent-fail (non-critical for core popup function)"
  - "150ms debounce for dictionary fetch, 200ms delay for hide (cursor transition)"

patterns-established:
  - "Optimistic toggle with rollback: save/unsave uses placeholder then corrects on response or rolls back on error"
  - "Parallel fetch pattern: lookup + character fetched via Promise.all for single-char words"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 48 Plan 01: Vocabulary API + Character Popup Hook Summary

**Vocabulary save/unsave API with Clerk auth and useCharacterPopup hook providing debounced dictionary fetching, abort cancellation, virtual element positioning, and optimistic vocabulary toggle**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T00:50:10Z
- **Completed:** 2026-02-09T00:53:25Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Vocabulary CRUD API (GET/POST/DELETE) with duplicate detection and user-scoped deletion
- useCharacterPopup hook managing all popup state: word activation, dictionary data, character details, visibility, positioning
- Debounced dictionary fetching (150ms) with AbortController for request cancellation on word change
- Optimistic vocabulary toggle with rollback on error, using placeholder IDs during pending saves

## Task Commits

Each task was committed atomically:

1. **Task 1: Create vocabulary save/unsave API route** - `83fb553` (feat)
2. **Task 2: Create useCharacterPopup state management hook** - `bf5d518` (feat)

## Files Created/Modified
- `src/app/api/vocabulary/route.ts` - GET (list saved IDs), POST (save with duplicate check), DELETE (unsave with user scoping)
- `src/hooks/useCharacterPopup.ts` - Central popup state hook with dictionary fetching, character detail, vocabulary tracking, virtual element

## Decisions Made
- Used `getCurrentUser()` from `@/lib/auth` instead of raw `auth()` because `savedVocabulary.userId` is a UUID referencing `users.id`, not the Clerk string ID
- Optimistic save uses a placeholder ID (`pending-{timestamp}`) that gets replaced with the real UUID on successful server response
- Vocabulary fetch on mount silently fails (bookmark state is enhancement, not critical for popup to function)
- 150ms debounce on dictionary fetch balances responsiveness with request reduction; 200ms hide delay allows cursor to reach popup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used getCurrentUser() instead of raw auth() for UUID mapping**
- **Found during:** Task 1
- **Issue:** Plan specified `const { userId } = await auth()` but savedVocabulary.userId is a UUID referencing users.id, while Clerk auth() returns a string Clerk ID
- **Fix:** Used `getCurrentUser()` which looks up the user by clerkId and returns the full user record with UUID id
- **Files modified:** src/app/api/vocabulary/route.ts
- **Verification:** TypeScript compilation passes, userId types match
- **Committed in:** 83fb553

**2. [Rule 2 - Missing Critical] Added input validation on POST body**
- **Found during:** Task 1
- **Issue:** Plan didn't specify validation for missing required fields in POST body
- **Fix:** Added validation check for traditional, simplified, and definitions fields with 400 response
- **Files modified:** src/app/api/vocabulary/route.ts
- **Verification:** Invalid requests return 400 instead of crashing
- **Committed in:** 83fb553

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for correctness and robustness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Vocabulary API ready for popup UI components to consume
- useCharacterPopup hook ready to be integrated into ReaderTextArea and popup components
- All exported types (DictionaryEntry, LookupData, CharacterDetailData, etc.) available for popup UI components

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 48-character-popup*
*Completed: 2026-02-09*
