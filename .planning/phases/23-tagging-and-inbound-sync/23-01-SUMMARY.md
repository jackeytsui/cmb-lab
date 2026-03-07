---
phase: 23-tagging-and-inbound-sync
plan: 01
subsystem: database, api
tags: [drizzle, postgres, tags, crud, zod, clerk]

# Dependency graph
requires:
  - phase: 21-ghl-sync-infrastructure
    provides: ghl_contacts table, sync event logging, Drizzle schema patterns
provides:
  - tags, student_tags, auto_tag_rules database tables
  - Tag CRUD service library (src/lib/tags.ts)
  - REST API routes for tag management, student tag assignment, auto-tag rules
  - cachedData and lastFetchedAt columns on ghl_contacts
affects: [23-02 sync layer, 23-03 UI layer]

# Tech tracking
tech-stack:
  added: []
  patterns: [idempotent tag assignment via ON CONFLICT DO NOTHING, source-aware tag operations for sync control]

key-files:
  created:
    - src/db/schema/tags.ts
    - src/lib/tags.ts
    - src/app/api/admin/tags/route.ts
    - src/app/api/admin/tags/[tagId]/route.ts
    - src/app/api/students/[studentId]/tags/route.ts
    - src/app/api/admin/auto-tag-rules/route.ts
  modified:
    - src/db/schema/ghl.ts
    - src/db/schema/index.ts

key-decisions:
  - "assignTag/removeTag accept source option (api/webhook/system) to control outbound sync behavior"
  - "Tag assignment uses ON CONFLICT DO NOTHING for idempotency, returns assigned boolean"
  - "All tag routes require coach+ role (not admin-only) for coach usability"

patterns-established:
  - "Source-aware mutations: functions accept { source } option to distinguish UI vs webhook vs system origin"
  - "Idempotent assignment: INSERT ON CONFLICT DO NOTHING with boolean return indicating new vs existing"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 23 Plan 01: Tag Schema & CRUD API Summary

**Three Drizzle tables (tags, student_tags, auto_tag_rules) with source-aware tag service and 5 API route files for complete tag management**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T07:05:45Z
- **Completed:** 2026-01-31T07:08:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created tags table with name, color, type (coach/system), description, and createdBy
- Created student_tags join table with unique (userId, tagId) constraint for dedup
- Created auto_tag_rules table with conditionType/conditionValue for rule-based tagging
- Added cachedData (jsonb) and lastFetchedAt columns to ghl_contacts for GHL data caching
- Built tag service library with 8 functions including idempotent assignTag with source awareness
- Created 5 API route files covering tag CRUD, student tag assignment, and auto-tag rule management

## Task Commits

Each task was committed atomically:

1. **Task 1: Tag database schema and ghl_contacts cache columns** - `f8253cf` (feat)
2. **Task 2: Tag service library and API routes** - `85191cc` (feat)

## Files Created/Modified
- `src/db/schema/tags.ts` - Tags, studentTags, autoTagRules tables with relations and type exports
- `src/db/schema/ghl.ts` - Added cachedData jsonb and lastFetchedAt columns
- `src/db/schema/index.ts` - Barrel export for tags schema
- `src/lib/tags.ts` - Tag CRUD service with 8 exported functions
- `src/app/api/admin/tags/route.ts` - GET list and POST create for tags
- `src/app/api/admin/tags/[tagId]/route.ts` - PATCH update and DELETE for tags
- `src/app/api/students/[studentId]/tags/route.ts` - GET/POST/DELETE for student tag assignment
- `src/app/api/admin/auto-tag-rules/route.ts` - GET/POST/PATCH/DELETE for auto-tag rules

## Decisions Made
- assignTag/removeTag accept `source` option ("api" | "webhook" | "system") so Plan 02's sync layer can distinguish UI-originated changes from webhook-originated changes, preventing echo loops
- Tag assignment returns `{ assigned: boolean, tag }` so callers know if a new assignment was made (useful for conditional sync)
- All tag management routes require coach+ role (not admin-only) since coaches need to tag students directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database push could not be verified (DATABASE_URL not configured in dev environment) - schema validated via TypeScript compilation only

## User Setup Required

None - no external service configuration required. Database schema will be applied when `npx drizzle-kit push` is run with DATABASE_URL configured.

## Next Phase Readiness
- Schema and service layer ready for Plan 02 (sync layer) to wire outbound GHL tag sync
- API routes ready for Plan 03 (UI layer) to consume
- Source-aware assignTag/removeTag designed to support Plan 02's echo prevention

---
*Phase: 23-tagging-and-inbound-sync*
*Completed: 2026-01-31*
