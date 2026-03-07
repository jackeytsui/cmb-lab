---
phase: 64-permission-builder
plan: 01
subsystem: api, database
tags: [drizzle, rbac, permissions, granular-access, course-tree]

# Dependency graph
requires:
  - phase: 63-role-management
    provides: "Role CRUD API and roleCourses/roleFeatures tables"
  - phase: 62-rbac-foundation
    provides: "Permission resolver with courseIdSet, featureSet, accessTierMap"
provides:
  - "roleCourses table with moduleId/lessonId for granular permission grants"
  - "Permission resolver with canAccessModule/canAccessLesson sync methods"
  - "GET /api/admin/roles/:roleId?tree=true returning courseTree + grants"
  - "PUT /api/admin/roles/:roleId/courses for course/module/lesson permission mutations"
  - "PUT /api/admin/roles/:roleId/features for feature flag mutations"
affects: [64-02-permission-builder-ui, 65-assignment-enforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-then-insert pattern for nullable unique index columns"
    - "Parallel query fan-out for course tree assembly"
    - "Grant granularity categorization: course/module/lesson levels"

key-files:
  created:
    - "src/app/api/admin/roles/[roleId]/courses/route.ts"
    - "src/app/api/admin/roles/[roleId]/features/route.ts"
  modified:
    - "src/db/schema/roles.ts"
    - "src/lib/permissions.ts"
    - "src/app/api/admin/roles/[roleId]/route.ts"

key-decisions:
  - "Direct SQL migration via pg instead of drizzle-kit push due to interactive prompt conflicts with non-LMS tables in shared Neon database"
  - "Standard 4-column unique index (not COALESCE-based) with delete-then-insert at API layer to handle NULL uniqueness"

patterns-established:
  - "Grant granularity: course-level (null/null), module-level (moduleId/null), lesson-level (moduleId/lessonId)"
  - "Delete-then-insert for nullable unique columns in PostgreSQL"

# Metrics
duration: 22m
completed: 2026-02-14
---

# Phase 64 Plan 01: Permission Builder API Summary

**Granular course/module/lesson permission grants via roleCourses schema evolution, updated resolver, and three API endpoints for permission builder UI**

## Performance

- **Duration:** 22 min
- **Started:** 2026-02-14T13:46:54Z
- **Completed:** 2026-02-14T14:09:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Evolved roleCourses table with nullable moduleId and lessonId FK columns for three-level permission granularity
- Updated permission resolver to categorize grants by level and expose canAccessModule/canAccessLesson sync methods
- Extended GET /api/admin/roles/:roleId with ?tree=true returning full course hierarchy + permission grants
- Created PUT endpoints for course and feature permission mutations with proper auth and validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Evolve roleCourses schema and update permission resolver** - `50a89ee` (feat)
2. **Task 2: Create permission mutation API endpoints and extend role GET** - `9bfb661` (feat)

## Files Created/Modified
- `src/db/schema/roles.ts` - Added moduleId/lessonId columns, updated unique index and relations
- `src/lib/permissions.ts` - Added moduleGrants/lessonGrants sets, canAccessModule/canAccessLesson methods
- `src/app/api/admin/roles/[roleId]/route.ts` - Extended GET with ?tree=true for course tree + grants
- `src/app/api/admin/roles/[roleId]/courses/route.ts` - PUT endpoint for course/module/lesson permission mutations
- `src/app/api/admin/roles/[roleId]/features/route.ts` - PUT endpoint for feature flag mutations

## Decisions Made
- **Direct SQL migration instead of db:push:** The shared Neon database contains non-LMS tables that trigger interactive rename prompts in drizzle-kit push. Used pg module directly to run ALTER TABLE/CREATE INDEX statements.
- **Standard unique index with API-layer dedup:** PostgreSQL NULL handling means the 4-column unique index won't prevent duplicate NULL rows. The API uses delete-then-insert pattern to ensure correctness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used direct SQL instead of drizzle-kit push for schema migration**
- **Found during:** Task 1 (schema migration step)
- **Issue:** `npm run db:push` enters interactive mode asking to rename unrelated tables in the shared Neon database
- **Fix:** Used `pg` module with dotenv to execute ALTER TABLE and CREATE INDEX SQL directly
- **Files modified:** None (database-only change)
- **Verification:** Confirmed columns exist via information_schema query
- **Committed in:** 50a89ee (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration approach changed from db:push to direct SQL. Same result, different mechanism. No scope creep.

## Issues Encountered
- Neon serverless driver (`@neondatabase/serverless`) failed with `fetch` error when running outside Next.js context. Switched to `pg` module which connects directly via TCP/SSL.
- drizzle-kit push interactive prompt due to non-LMS tables in shared database is a known recurring issue (Decision 9 in STATE.md).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All API endpoints ready for permission builder UI (Plan 02)
- Course tree endpoint provides the data structure needed for checkbox-based permission assignment
- Permission resolver fully supports granular grants for enforcement in Phase 65

## Self-Check: PASSED

All 5 files verified present. Both task commits (50a89ee, 9bfb661) confirmed in git log.

---
*Phase: 64-permission-builder*
*Completed: 2026-02-14*
