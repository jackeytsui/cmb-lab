---
phase: 67-migration-compatibility
plan: 01
subsystem: api
tags: [migration, rbac, courseAccess, drizzle, transactions]

# Dependency graph
requires:
  - phase: 62-schema-resolver
    provides: "roles, roleCourses, roleFeatures, userRoles tables + resolvePermissions() + FEATURE_KEYS"
  - phase: 65-assignment-enforcement
    provides: "Permission enforcement infrastructure (canAccessCourse, canUseFeature)"
provides:
  - "GET /api/admin/migration -- preview courseAccess patterns grouped by fingerprint"
  - "POST /api/admin/migration -- execute Legacy role creation with all 7 feature keys"
  - "POST /api/admin/migration?action=verify -- zero-regression verification"
affects: [67-migration-compatibility, 68-analytics-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Fingerprint-based pattern grouping for batch role creation", "Transaction-per-pattern atomicity for migration safety", "Idempotency via Legacy: prefix check"]

key-files:
  created:
    - "src/app/api/admin/migration/route.ts"
  modified: []

key-decisions:
  - "Transaction per pattern (not single global transaction) for partial progress on failure"
  - "assignedBy: null for system-initiated migration (consistent with Decision 26)"
  - "Role name truncation at 3 courses with '... (+N more)' suffix"
  - "All 7 FEATURE_KEYS granted to every Legacy role (pre-RBAC students had all features)"

patterns-established:
  - "Migration fingerprint: sort courseAccess by courseId, join as courseId:accessTier|... for deterministic grouping"
  - "Idempotency check: query for 'Legacy:%' role names before executing"

# Metrics
duration: 2m 19s
completed: 2026-02-15
---

# Phase 67 Plan 01: Migration API Summary

**Migration API with GET preview, POST execute (Legacy roles + all 7 feature keys + course mappings in transactions), and POST verify (resolvePermissions vs courseAccess regression check)**

## Performance

- **Duration:** 2m 19s
- **Started:** 2026-02-15T01:21:05Z
- **Completed:** 2026-02-15T01:23:35Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created migration API endpoint at `/api/admin/migration` with three modes
- GET handler analyzes courseAccess records, groups students by access pattern fingerprint, returns preview with suggested role names, student counts, and course details
- POST execute creates Legacy roles with course mappings and all 7 feature keys atomically per pattern, assigns students via userRoles
- POST verify compares every student's courseAccess grants against resolvePermissions() output and reports regressions
- Idempotency guard prevents duplicate migration (checks for existing "Legacy:" roles)
- Only students with active (non-expired) courseAccess are migrated; admin/coach users skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration API route with preview, execute, and verify modes** - `31dcbb7` (feat)

## Files Created/Modified
- `src/app/api/admin/migration/route.ts` - Migration API with GET (preview), POST (execute/verify) handlers; fingerprint analysis, transaction-based role creation, regression verification

## Decisions Made
- Transaction per pattern rather than single global transaction: allows partial progress if one pattern fails
- `assignedBy: null` for system migration (consistent with nullable signature from Decision 26)
- Role names truncated at 3 courses: `"Legacy: Course A + Course B + Course C... (+2 more)"`
- All 7 FEATURE_KEYS granted to every Legacy role since pre-RBAC students had unrestricted feature access
- Student lookup within transaction uses email array match via `= ANY()` SQL for efficiency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Migration API ready for admin to preview, execute, and verify courseAccess migration
- Phase 67 Plan 02 (if any) or Phase 68 (Analytics) can proceed
- Migration is safe to run: idempotent, transactional, and verifiable

## Self-Check: PASSED

- FOUND: src/app/api/admin/migration/route.ts
- FOUND: 31dcbb7

---
*Phase: 67-migration-compatibility*
*Completed: 2026-02-15*
