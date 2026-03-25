---
phase: 76-team-feedback-polish
plan: 02
subsystem: coaching
tags: [openai, gpt-4o-mini, translation, coaching, ghl, iframe]

# Dependency graph
requires:
  - phase: 76-01
    provides: coaching page foundation and session management
provides:
  - Mando<>Canto copy-over translation API for coaching notes
  - Per-entry explanation/notes field on coaching notes
  - GHL session tracking form embed for coaches
affects: [coaching]

# Tech tracking
tech-stack:
  added: []
  patterns: [direct OpenAI fetch for translation, details/summary accordion, debounced auto-save]

key-files:
  created:
    - src/app/api/coaching/translate/route.ts
    - src/db/migrations/0034_cheerful_ikaris.sql
  modified:
    - src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx
    - src/app/api/coaching/notes/[noteId]/route.ts
    - src/db/schema/coaching.ts

key-decisions:
  - "Direct OpenAI fetch instead of library — consistent with existing pattern in codebase"
  - "Partial PATCH payload — only update fields explicitly provided to avoid overwriting existing values"
  - "Native details/summary for GHL form accordion — zero JS, progressive enhancement"

patterns-established:
  - "Copy-over translation: translate via API then create note in opposite pane"
  - "Debounced auto-save: 800ms debounce + save on blur for inline text fields"

requirements-completed: [FB-03, FB-04, FB-05]

# Metrics
duration: 6min
completed: 2026-03-25
---

# Phase 76 Plan 02: Coaching Enhancements Summary

**Mando<>Canto copy-over translation via GPT-4o-mini, per-entry explanation notes with auto-save, and GHL tracking form embed for coaches**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-25T14:04:10Z
- **Completed:** 2026-03-25T14:10:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Copy-over translation API using GPT-4o-mini for bidirectional Mandarin-Cantonese translation
- Per-entry explanation/notes field with debounced auto-save for coaches and read-only view for students
- GHL session tracking form embedded in collapsible accordion on 1:1 coaching pages (coaches only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy-Over Translation + Per-Entry Notes** - `47126ad` (feat)
2. **Task 2: GHL Tracking Form Embed** - `7f6a7ad` (feat)
3. **Fix: Chevron rotation on accordion** - `1ebbe0e` (fix)

## Files Created/Modified
- `src/app/api/coaching/translate/route.ts` - POST endpoint for Mando<>Canto translation using GPT-4o-mini
- `src/db/schema/coaching.ts` - Added explanation column to coachingNotes table
- `src/db/migrations/0034_cheerful_ikaris.sql` - Migration for explanation column
- `src/app/api/coaching/notes/[noteId]/route.ts` - Updated PATCH to accept explanation field with partial updates
- `src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx` - NoteCard with Copy Over, Add Notes buttons, explanation section, and GHL form embed

## Decisions Made
- Used direct OpenAI fetch rather than a library, consistent with existing codebase patterns (realtime token, video transcribe, etc.)
- PATCH endpoint changed to partial update pattern (only set fields explicitly in body) to avoid overwriting unrelated fields when saving just explanation
- Native `<details>/<summary>` for GHL form accordion rather than custom React state, for simplicity and progressive enhancement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chevron rotation on details/summary accordion**
- **Found during:** Task 2 (GHL form embed)
- **Issue:** Initial Tailwind CSS selectors for `[open]` state were on `<summary>` instead of `<details>`
- **Fix:** Used `group` on `<details>` and `group-open:rotate-180` on the chevron icon
- **Files modified:** src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx
- **Committed in:** 1ebbe0e

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor CSS fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - OPENAI_API_KEY already configured in production environment.

## Next Phase Readiness
- Coaching enhancements complete, translation and notes ready for coach use
- Migration 0034 needs to be applied to production database

---
*Phase: 76-team-feedback-polish*
*Completed: 2026-03-25*
