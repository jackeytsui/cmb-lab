---
phase: 23-tagging-and-inbound-sync
plan: 04
subsystem: ui, api
tags: [react, fetch, abort-controller, tag-filtering, drizzle]

# Dependency graph
requires:
  - phase: 23-tagging-and-inbound-sync (plans 01-03)
    provides: Tag schema, TagFilter component, /api/admin/students endpoint with tagIds support
provides:
  - Client-side tag filter wired to server-side API fetch
  - Coach+ role access to students API endpoint
  - AbortController-based request cancellation for rapid filter changes
  - Graceful fallback to client-side filtering on API error
affects: [24-pagination, future student management features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useEffect + AbortController for cancellable API fetches on filter state change"
    - "Graceful degradation: server-side fetch with client-side fallback"

key-files:
  created: []
  modified:
    - src/app/(dashboard)/coach/students/StudentListWithTags.tsx
    - src/app/api/admin/students/route.ts

key-decisions:
  - "Relaxed API from admin-only to coach+ role to match page-level access control"
  - "AbortController cancels in-flight requests when filters change rapidly"
  - "Falls back to client-side filtering if API returns non-OK (e.g., auth issues)"
  - "accessCount preserved from initial server data since API doesn't include it"

patterns-established:
  - "Cancellable fetch pattern: useEffect with AbortController ref for API calls triggered by state changes"

# Metrics
duration: 4min
completed: 2026-01-31
---

# Phase 23 Plan 04: Tag Filter API Wiring Summary

**Wired TagFilter selectedTagIds to /api/admin/students?tagIds= with AbortController cancellation and client-side fallback**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-31T07:51:37Z
- **Completed:** 2026-01-31T07:55:30Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Tag filter selection now fetches server-filtered results from /api/admin/students?tagIds=
- Eliminated window.location.reload() -- tag changes and tag assignment both refresh via API
- Added loading spinner ("Filtering...") during server-side fetch
- API role check relaxed from admin-only to coach+ for consistency with page access control
- Graceful fallback to client-side filtering if API returns error

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire tag filter to server-side API fetch** - `3f8cd09` (feat)

## Files Created/Modified
- `src/app/(dashboard)/coach/students/StudentListWithTags.tsx` - Added useEffect with AbortController for API fetch on tag filter change, loading state, handleTagsChange refetch via API
- `src/app/api/admin/students/route.ts` - Changed hasMinimumRole("admin") to hasMinimumRole("coach")

## Decisions Made
- Relaxed API role from admin to coach+ since the page itself requires coach role and the decision log states "All tag routes require coach+ role (not admin-only)"
- Used AbortController to cancel in-flight requests when filters change rapidly, preventing stale results
- Preserved accessCount from initial server-rendered data since the API endpoint doesn't include course access counts
- Falls back to client-side filtering if the API returns a non-OK response, ensuring tag filtering always works

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build fails at static page generation due to missing CLERK_PUBLISHABLE_KEY env var (pre-existing, unrelated to changes). TypeScript compilation passes cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TAG-03 gap closed: tag filter selection triggers server-side API fetch
- Ready for Phase 24 pagination -- server-side filtering will work correctly with paginated results
- No blockers

---
*Phase: 23-tagging-and-inbound-sync*
*Completed: 2026-01-31*
