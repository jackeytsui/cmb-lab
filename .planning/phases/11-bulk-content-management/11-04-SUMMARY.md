---
phase: 11-bulk-content-management
plan: 04
subsystem: content-management
tags: [move-content, api, modal, drizzle, transactions]
dependency-graph:
  requires: [11-01]
  provides: [move-lesson-api, move-module-api, move-content-modal]
  affects: [admin-panel-integration]
tech-stack:
  added: []
  patterns: [transaction-based-move, sortOrder-shift, reusable-modal]
key-files:
  created:
    - src/app/api/admin/lessons/[lessonId]/move/route.ts
    - src/app/api/admin/modules/[moduleId]/move/route.ts
    - src/components/admin/MoveContentModal.tsx
  modified: []
decisions:
  - Transaction-based move with sortOrder shift for position insertion
  - AlertDialog for move confirmation UI (consistent with existing admin patterns)
  - Fetch course hierarchy for lesson target selection (course > module display)
metrics:
  duration: 7min
  completed: 2026-01-29
---

# Phase 11 Plan 04: Move Content APIs and Modal Summary

Transaction-based APIs for moving lessons between modules and modules between courses, with reusable AlertDialog modal component.

## What Was Built

### Move Lesson API (`PATCH /api/admin/lessons/[lessonId]/move`)
- Accepts `targetModuleId` and optional `position` parameter
- Validates lesson existence, target module existence, soft-delete filtering
- Transaction: shifts existing sortOrder values at target position, then updates lesson's moduleId and sortOrder
- Returns updated lesson with destination metadata

### Move Module API (`PATCH /api/admin/modules/[moduleId]/move`)
- Accepts `targetCourseId` and optional `position` parameter
- Same validation and transaction pattern as lesson move
- Updates module's courseId and sortOrder atomically

### MoveContentModal Component
- Reusable for both lesson and module moves via `contentType` prop
- Fetches available targets dynamically (modules grouped by course for lessons, courses for modules)
- Excludes current parent from options
- Handles loading, error, and empty states
- Select dropdown with hierarchical display (Course > Module)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 201640c | feat(11-04): create move lesson API route |
| 2 | dca972b | feat(11-04): create move module API route |
| 3 | 2cb6071 | feat(11-04): create move content modal component |

## Decisions Made

1. **Transaction-based move with sortOrder shift** - When inserting at a specific position, existing items at that position and beyond are shifted up by 1 before the move, ensuring no sortOrder collisions.

2. **AlertDialog for move UI** - Consistent with existing admin patterns (delete confirmation uses AlertDialog). Provides cancel/confirm flow.

3. **Hierarchical target display** - For lesson moves, targets display as "Course Title > Module Title" so coaches can identify the correct destination across courses.

## Deviations from Plan

None - plan executed exactly as written. Files already existed as untracked working copies matching the plan specification.

## Verification

- [x] TypeScript compiles without errors (`npx tsc --noEmit` clean)
- [x] Move lesson API updates moduleId and sortOrder in transaction
- [x] Move module API updates courseId and sortOrder in transaction
- [x] Position insertion shifts existing items correctly
- [x] Coach role minimum enforced on both endpoints
- [x] Modal component exceeds 100 lines (212 lines)
- [x] Modal fetches targets matching key_links patterns

## Next Phase Readiness

All move APIs and modal ready for integration into admin detail pages. No blockers.
