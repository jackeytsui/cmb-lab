---
phase: 62-schema-permission-resolver
plan: 02
subsystem: auth
tags: [rbac, permissions, react-cache, drizzle, zod, resolver]

# Dependency graph
requires:
  - phase: 62-01
    provides: "Four RBAC tables (roles, role_courses, role_features, user_roles) in Drizzle schema and Neon DB"
provides:
  - "resolvePermissions() -- cache()-wrapped per-request permission resolver"
  - "PermissionSet interface with sync canAccessCourse/canUseFeature/getAccessTier methods"
  - "canAccessModule() and canAccessLesson() async helper functions"
  - "FEATURE_KEYS const array, FeatureKey type, featureKeySchema Zod schema"
  - "Dual-system union: role-based grants + courseAccess records merged additively"
affects: [63-role-crud, 64-permission-builder, 65-assignment-enforcement, 66-webhook, 67-migration, 68-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React 19 cache() for per-request deduplication of DB-heavy resolvers"
    - "Additive union pattern: multiple grant sources merged with never-downgrade tier logic"
    - "PermissionSet as plain data object with sync methods, not a class"
    - "Async helpers as standalone functions (not PermissionSet methods) for DB lookups"

key-files:
  created:
    - "src/lib/permissions.ts"
  modified: []

key-decisions:
  - "Used React cache() from 'react' (not custom utility) for per-request deduplication -- avoids cross-request caching in serverless"
  - "PermissionSet methods are sync (canAccessCourse, canUseFeature, getAccessTier) since they operate on pre-resolved sets/maps"
  - "canAccessModule/canAccessLesson are standalone async functions (not class methods) to keep PermissionSet as a plain data object"
  - "Access tier merge uses never-downgrade rule: preview can upgrade to full, but full never downgrades to preview"

patterns-established:
  - "Permission resolver pattern: resolve once per request, check many times synchronously"
  - "Dual-system union: role grants + direct courseAccess merged in single resolver"
  - "Feature key validation: FEATURE_KEYS const array + Zod enum schema (not pgEnum)"

# Metrics
duration: 1m 20s
completed: 2026-02-14
---

# Phase 62 Plan 02: Permission Resolver Summary

**Centralized permission resolver with React cache() deduplication that unions role-based grants with courseAccess records into a PermissionSet with sync access checks**

## Performance

- **Duration:** 1m 20s
- **Started:** 2026-02-14T12:17:20Z
- **Completed:** 2026-02-14T12:18:40Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `src/lib/permissions.ts` with complete permission resolver system
- resolvePermissions() wrapped in React 19 cache() for per-request deduplication
- PermissionSet unions role-based grants (roleCourses, roleFeatures) with direct courseAccess records
- Expired assignments excluded via `or(isNull(expiresAt), gt(expiresAt, now))` pattern
- Async canAccessModule() and canAccessLesson() traverse course hierarchy for authorization checks
- FEATURE_KEYS with Zod validation for type-safe feature gating
- TypeScript compiles with zero errors
- `src/lib/auth.ts` remains completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Create permission resolver with React cache()** - `9f519e9` (feat)

## Files Created/Modified
- `src/lib/permissions.ts` - Centralized permission resolver: resolvePermissions(), PermissionSet interface, canAccessModule(), canAccessLesson(), FEATURE_KEYS, featureKeySchema

## Decisions Made
- Used `import { cache } from "react"` (React 19 built-in) rather than any custom caching utility. This provides automatic per-request deduplication via React's server component request lifecycle, avoiding the pitfall of module-level Maps that would cache across requests in serverless environments.
- PermissionSet is a plain object with sync methods (not a class), keeping it serialization-friendly and simple.
- canAccessModule/canAccessLesson are standalone async functions because they need DB access (modules/lessons table lookups), which doesn't belong on the data-only PermissionSet.
- Access tier merge rule: "full" always wins. If any source (role grant or direct grant) provides "full", the tier is "full". Never downgrade from "full" to "preview".

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Permission resolver is the foundation for all downstream RBAC phases
- Phase 63 (Role CRUD) can now use resolvePermissions() for testing role creation effects
- Phase 64 (Permission Builder) will use PermissionSet interface for UI display
- Phase 65 (Assignment + Enforcement) will call resolvePermissions() in middleware/server actions
- FEATURE_KEYS array ready for Phase 64's feature flag UI checkboxes

## Self-Check: PASSED

- FOUND: src/lib/permissions.ts
- FOUND: commit 9f519e9 (Task 1)
- FOUND: 62-02-SUMMARY.md

---
*Phase: 62-schema-permission-resolver*
*Completed: 2026-02-14*
