---
phase: 16-search
plan: 02
subsystem: api
tags: [search, ilike, relevance-ranking, pinyin, jyutping, chinese, drizzle, access-control]

# Dependency graph
requires:
  - phase: 16-search plan 01
    provides: searchPinyin/searchJyutping columns on courses and lessons, sanitizeSearchQuery utility
  - phase: 01-foundation
    provides: courses, modules, lessons, courseAccess, users schema
provides:
  - GET /api/search?q=term endpoint with relevance-ranked, access-controlled results
affects: [16-search plan 03 (search UI)]

# Tech tracking
tech-stack:
  added: []
  patterns: [ILIKE pattern search with CASE-based relevance scoring, enrollment-based access control via courseAccess join]

key-files:
  created:
    - src/app/api/search/route.ts
  modified: []

key-decisions:
  - "Return empty results (200) for short queries instead of 400 error -- better UX for search-as-you-type"
  - "Relevance weighting: title(10) > pinyin/jyutping(5) > description(2) -- titles are most specific"
  - "Combined course + lesson results sorted together by relevance, capped at 20"

patterns-established:
  - "Search relevance via SQL CASE expression in SELECT, sorted in application layer"
  - "Access control pattern: join courseAccess + users, filter on users.clerkId"

# Metrics
duration: 1min
completed: 2026-01-30
---

# Phase 16 Plan 02: Search API Summary

**GET /api/search endpoint with ILIKE matching, CASE-based relevance ranking (title>pinyin>description), and courseAccess enrollment filtering**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-30T10:52:12Z
- **Completed:** 2026-01-30T10:53:13Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Search API at GET /api/search?q=term returns courses and lessons matching query text
- Relevance ranking via SQL CASE: title matches (10) > pinyin/jyutping (5) > description (2)
- Chinese character queries match title/description, romanization queries match searchPinyin/searchJyutping
- Access control ensures only enrolled courses appear (courseAccess + users join, expiresAt check)
- SQL wildcard sanitization via sanitizeSearchQuery from search-utils
- Soft-delete filtering on courses, modules, and lessons (deletedAt IS NULL)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create search API route** - `0962513` (feat)

## Files Created/Modified
- `src/app/api/search/route.ts` - Search API endpoint with ILIKE, relevance ranking, access control

## Decisions Made
- Return empty results (200) for queries under 2 characters instead of 400 error -- friendlier for search-as-you-type UI
- Relevance weighting: title(10) > pinyin/jyutping(5) > description(2) -- title matches are most specific
- Combined course + lesson results in single sorted array, capped at 20 total results
- Lesson query includes isNull(modules.deletedAt) per plan note -- prevents soft-deleted module leakage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Search API ready for Plan 03 (search UI components)
- Endpoint follows same auth pattern as knowledge/search route

---
*Phase: 16-search*
*Completed: 2026-01-30*
