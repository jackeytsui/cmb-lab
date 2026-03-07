---
phase: 28-coach-page-ux-polish
plan: 01
subsystem: ui
tags: [loading-skeleton, error-handling, coach-pages, next.js, server-components]

# Dependency graph
requires:
  - phase: 26-error-handling-infrastructure
    provides: ErrorAlert component (inline + block variants), Skeleton component
  - phase: 27-student-page-ux-polish
    provides: Loading skeleton and server-side error handling patterns
provides:
  - Coach dashboard loading skeleton (layout-matching Suspense fallback)
  - Submission detail loading skeleton (two-column layout placeholders)
  - Conversations list loading skeleton (card list placeholders)
  - Submission detail discriminated error/not-found handling
  - Students page try/catch with ErrorAlert fallback
  - Missing audio graceful degradation
affects: [28-02-PLAN, 29-admin-page-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coach loading skeletons follow same dark theme pattern as student skeletons (bg-zinc-800 override)"
    - "Discriminated {data, error} return from getSubmission separates DB errors from missing submissions"
    - "Auth checks outside try/catch, DB queries inside, greeting preserved on error"

key-files:
  created:
    - src/app/(dashboard)/coach/loading.tsx
    - src/app/(dashboard)/coach/submissions/[submissionId]/loading.tsx
    - src/app/(dashboard)/coach/conversations/loading.tsx
  modified:
    - src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx
    - src/app/(dashboard)/coach/students/page.tsx

key-decisions:
  - "Submission detail getSubmission returns {data, error} tuple to distinguish DB errors from missing submissions"
  - "Missing audio data shows 'Audio recording is unavailable' instead of falling through to text response branch"
  - "Students page preserves greeting on error since it comes from Clerk, not failing DB query"

patterns-established:
  - "Coach server-component error handling: same auth-outside-try/catch pattern as student pages"
  - "Discriminated result pattern for DB queries that need to distinguish error from empty"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 28 Plan 01: Coach Loading Skeletons & Error Handling Summary

**3 coach loading skeletons (dashboard/submission/conversations) plus discriminated error handling on submission detail and students pages**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T09:52:10Z
- **Completed:** 2026-02-06T09:55:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Coach dashboard, submission detail, and conversations pages now show layout-matching skeletons instead of blank pages while loading
- Submission detail page distinguishes DB errors (ErrorAlert with back link) from genuinely missing submissions (notFound)
- Students page wraps DB queries in try/catch with block ErrorAlert while preserving Clerk greeting
- Missing audio data shows graceful "Audio recording is unavailable" message instead of falling through to text response

## Task Commits

Each task was committed atomically:

1. **Task 1: Create loading.tsx skeletons for coach dashboard, submission detail, and conversations** - `c5a30e0` (feat)
2. **Task 2: Add try/catch with ErrorAlert to submission detail page and students page** - `0b13a26` (feat)

## Files Created/Modified
- `src/app/(dashboard)/coach/loading.tsx` - Coach dashboard loading skeleton with submission card grid placeholders
- `src/app/(dashboard)/coach/submissions/[submissionId]/loading.tsx` - Submission detail loading skeleton with two-column layout
- `src/app/(dashboard)/coach/conversations/loading.tsx` - Conversations list loading skeleton with card placeholders
- `src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx` - Discriminated {data, error} return, ErrorAlert on DB error, missing audio fallback
- `src/app/(dashboard)/coach/students/page.tsx` - try/catch wrapping DB queries, ErrorAlert fallback, greeting preserved

## Decisions Made
- Submission detail `getSubmission` returns `{data, error}` tuple so page can render ErrorAlert on DB errors while preserving notFound() for genuinely missing submissions (same pattern as student my-feedback getFeedback)
- Missing audio data renders "Audio recording is unavailable" rather than silently falling through to the text response branch
- Students page greeting renders in both success and error paths since it comes from Clerk, not from the failing DB query

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All coach server-rendered pages now have loading skeletons and error handling
- Ready for Phase 28 Plan 02 (remaining coach page UX polish)
- Pattern established for Phase 29 admin page UX polish

## Self-Check: PASSED

---
*Phase: 28-coach-page-ux-polish*
*Completed: 2026-02-06*
