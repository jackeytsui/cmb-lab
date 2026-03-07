---
phase: 63-role-management
plan: 01
subsystem: api
tags: [drizzle, zod, nextjs, roles, crud, soft-delete]

# Dependency graph
requires:
  - phase: 62-schema-permission-resolver
    provides: "roles, userRoles tables and types in @/db/schema/roles.ts"
provides:
  - "Role CRUD service module (src/lib/roles.ts) with 5 exported functions"
  - "GET/POST /api/admin/roles endpoints"
  - "GET/PATCH/DELETE /api/admin/roles/:roleId endpoints"
  - "POST /api/admin/roles/templates endpoint for preset seeding"
affects: [63-02-admin-ui, 65-assignment-enforcement, 66-webhook, 67-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["soft-delete with name rename to free unique constraint", "student count via grouped userRoles query"]

key-files:
  created:
    - src/lib/roles.ts
    - src/app/api/admin/roles/route.ts
    - src/app/api/admin/roles/[roleId]/route.ts
    - src/app/api/admin/roles/templates/route.ts
  modified: []

key-decisions:
  - "Soft-delete renames role name with _deleted_timestamp suffix to free unique constraint"
  - "Student counts computed via separate grouped query and Map join rather than SQL subquery"
  - "Template seeding checks existing role names in-memory before creating"

patterns-established:
  - "Role service pattern: mirrors tags.ts with soft-delete and student count enrichment"
  - "Unique constraint error handling: catch error.message includes 'unique constraint', return 409"

# Metrics
duration: 2m 41s
completed: 2026-02-14
---

# Phase 63 Plan 01: Role CRUD API Summary

**Role CRUD service module with 5 functions and 4 API routes covering create, edit, soft-delete with student protection, search, and template seeding**

## Performance

- **Duration:** 2m 41s
- **Started:** 2026-02-14T13:01:09Z
- **Completed:** 2026-02-14T13:03:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Role CRUD service module with getRoles (search + student counts), getRoleById, createRole (auto-increment sortOrder), updateRole, softDeleteRole (student protection + name rename)
- Three API route files: list+create, single+update+delete, template seeding
- All endpoints Zod-validated and role-guarded (coach for CRUD, admin for templates)
- Soft-delete renames to free unique constraint; DELETE returns 409 when students assigned

## Task Commits

Each task was committed atomically:

1. **Task 1: Create role CRUD service module** - `3033039` (feat)
2. **Task 2: Create API routes for role CRUD and templates** - `4aa4c77` (feat)

## Files Created/Modified
- `src/lib/roles.ts` - Role CRUD service with 5 exported functions (getRoles, getRoleById, createRole, updateRole, softDeleteRole)
- `src/app/api/admin/roles/route.ts` - GET (list with search) and POST (create with Zod validation) endpoints
- `src/app/api/admin/roles/[roleId]/route.ts` - GET (single), PATCH (partial update), DELETE (soft-delete with 409 protection) endpoints
- `src/app/api/admin/roles/templates/route.ts` - POST (admin-only idempotent Bronze/Silver/Gold seeding) endpoint

## Decisions Made
- Soft-delete renames role name with `_deleted_${Date.now()}` suffix to free the unique constraint for reuse
- Student counts computed via separate grouped query on userRoles + Map join, following the simple pattern from tags.ts rather than complex SQL subqueries
- Template seeding fetches all existing roles and checks names in a Set for O(1) lookup before creating

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 ROLE requirements (ROLE-01 through ROLE-06) have backend API support
- Ready for Phase 63 Plan 02: Admin UI for role management
- API contract established: GET/POST on `/api/admin/roles`, GET/PATCH/DELETE on `/api/admin/roles/:roleId`, POST on `/api/admin/roles/templates`

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (3033039, 4aa4c77) verified in git log.

---
*Phase: 63-role-management*
*Completed: 2026-02-14*
