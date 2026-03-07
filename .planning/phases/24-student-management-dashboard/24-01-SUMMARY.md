---
phase: 24-student-management-dashboard
plan: 01
subsystem: api, database
tags: [drizzle, postgres, student-queries, bulk-operations, filter-presets, pagination, sorting]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users table, role enum, auth middleware
  - phase: 04-progress-system
    provides: lesson_progress table for completion/activity tracking
  - phase: 23-tagging-and-inbound-sync
    provides: tags, student_tags tables for tag filtering
provides:
  - bulk_operations table schema for tracking batch student actions
  - filter_presets table schema for saved dashboard configurations
  - getStudentsPageData query builder with enriched student data
  - Enhanced /api/admin/students endpoint with sorting, filtering, pagination
affects: [24-02, 24-03, 24-04, 24-05, 24-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch enrichment pattern: fetch page of students then parallel-fetch tags, course counts, progress"
    - "Raw SQL with escapeLiteral for dynamic sort/filter expressions"
    - "Backward-compatible pagination (legacy limit/offset mapped to page/pageSize)"

key-files:
  created:
    - src/db/schema/bulk-operations.ts
    - src/db/schema/filter-presets.ts
    - src/lib/student-queries.ts
  modified:
    - src/db/schema/index.ts
    - src/app/api/admin/students/route.ts

key-decisions:
  - "Used raw SQL for dynamic sorting (correlated subqueries for lastActive/completionPercent) since drizzle ORM lacks dynamic orderBy from string"
  - "Completion percent calculated from lesson_progress completed_at counts per student"
  - "At-risk defined as no lesson_progress activity in past 7 days"
  - "Tables need db:push with DATABASE_URL (not applied in this session due to missing env)"

patterns-established:
  - "StudentQueryParams interface: standardized query params for student listing"
  - "Parallel enrichment: Promise.all for tags + courseAccess counts + progress aggregates"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 24 Plan 01: Data Foundation Summary

**Bulk operations/filter preset schemas, enriched student query builder with server-side sort/filter/pagination via getStudentsPageData**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T12:20:41Z
- **Completed:** 2026-01-31T12:24:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created bulk_operations table schema for tracking batch assign/remove course/tag actions with undo support
- Created filter_presets table schema for saving reusable dashboard filter configurations
- Built getStudentsPageData query builder returning enriched StudentRow[] with coursesEnrolled, completionPercent, lastActive, tags
- Enhanced /api/admin/students with sortBy (5 columns), sortOrder, courseId, atRisk filters, and page/pageSize pagination
- Maintained backward compatibility with legacy limit/offset query params

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bulk_operations and filter_presets schema files** - `9a52cf3` (feat)
2. **Task 2: Build student query builder and enhance API route** - `9c2a242` (feat)

## Files Created/Modified
- `src/db/schema/bulk-operations.ts` - bulk_operations table with operationType, targetId, studentIds, succeededIds, undoneAt, expiresAt
- `src/db/schema/filter-presets.ts` - filter_presets table with name, filters (jsonb), isDefault, createdBy
- `src/db/schema/index.ts` - Added barrel re-exports for both new schemas
- `src/lib/student-queries.ts` - getStudentsPageData query builder with StudentRow/StudentPageResult types
- `src/app/api/admin/students/route.ts` - Rewritten to use query builder, supports all new params

## Decisions Made
- Used raw SQL for sorting expressions since drizzle ORM orderBy requires static column references, but we need correlated subqueries for lastActive and completionPercent sorting
- At-risk filter uses lesson_progress last_accessed_at > NOW() - 7 days (students NOT in that set are at-risk)
- Completion percent = (completed lessons / total tracked lessons) per student from lesson_progress table
- Batch enrichment via parallel Promise.all for tags, course counts, and progress aggregates after fetching the student page
- Tables not yet applied to database (DATABASE_URL not configured in session) -- requires `npm run db:push` with env

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run db:push` failed due to missing DATABASE_URL environment variable. Tables are defined in schema but not yet created in the database. This is consistent with the existing pending todo to configure DATABASE_URL.

## User Setup Required
None beyond existing pending todos (DATABASE_URL configuration, then `npm run db:push`).

## Next Phase Readiness
- Data layer complete: query builder and API ready for UI consumption
- Plans 02-06 can build dashboard UI components against /api/admin/students
- Tables need `npm run db:push` before runtime testing

---
*Phase: 24-student-management-dashboard*
*Completed: 2026-01-31*
