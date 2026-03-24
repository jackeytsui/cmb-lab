---
phase: 75-lto-student-access-mandarin-accelerator
plan: 04
subsystem: admin-panel, reader, access-control
tags: [curated-content, reader-integration, feature-gating, crud-api]
dependency_graph:
  requires: [mandarin_accelerator-feature-key, accelerator-db-tables]
  provides: [curated-passage-crud, passage-read-tracking, curated-reader-view]
  affects: [ReaderClient, ReaderToolbar, admin-panel]
tech_stack:
  added: []
  patterns: [hideImport-prop-pattern, onConflictDoNothing-upsert, z-union-single-bulk]
key_files:
  created:
    - src/app/api/admin/accelerator/reader/route.ts
    - src/app/(dashboard)/admin/accelerator/reader/page.tsx
    - src/app/(dashboard)/admin/accelerator/reader/AdminReaderClient.tsx
    - src/app/(dashboard)/dashboard/accelerator/reader/page.tsx
    - src/app/(dashboard)/dashboard/accelerator/reader/[passageId]/page.tsx
    - src/app/api/accelerator/reader/progress/route.ts
  modified:
    - src/app/(dashboard)/dashboard/reader/ReaderClient.tsx
    - src/components/reader/ReaderToolbar.tsx
decisions:
  - Used hideImport prop on ReaderClient (Option B) instead of CSS selector targeting -- cleaner and more reliable
  - Made ReaderToolbar onImportClick optional and conditionally render import button + separator
  - Used div-based grid layout for admin passages table (no shadcn Table component available)
metrics:
  duration: 275s
  completed: 2026-03-24T22:48:15Z
---

# Phase 75 Plan 04: Comprehensive AI Reader Passages Summary

Admin CRUD + bulk JSON upload for curated passages, student passages list with read/unread badges, and ReaderClient integration with hidden import UI via hideImport prop.

## What Was Done

### Task 1: Admin API and panel for curated passages (321de0a)
- Created `src/app/api/admin/accelerator/reader/route.ts` with 4 handlers:
  - GET: Fetch all passages ordered by sortOrder
  - POST: Single or bulk create via `z.union([singleSchema, bulkSchema])`
  - PUT: Update passage by ID (title, body, sortOrder)
  - DELETE: Delete passage by ID
- All handlers guarded with `hasMinimumRole("coach")`
- Created admin page with `hasMinimumRole("coach")` redirect guard
- Created `AdminReaderClient.tsx` with:
  - Passage list in div-based grid (no shadcn Table available)
  - Add Passage dialog with title, body (textarea), and sortOrder fields
  - Bulk Upload JSON button with file input accepting `.json` files
  - Edit dialog with prepopulated fields
  - Delete confirmation dialog

### Task 2: Student curated passages list and reader integration (77f656a)
- Created `src/app/api/accelerator/reader/progress/route.ts`:
  - GET: Returns `{ readPassageIds: string[] }` for current user
  - POST: Upserts passage read status with `onConflictDoNothing`
- Created student passages list page wrapped in `<FeatureGate feature="mandarin_accelerator">`:
  - Fetches passages and read statuses server-side
  - Renders 1-column (mobile) / 2-column (desktop) grid of passage cards
  - Each card shows title, body preview, and Read (green) or Unread (gray) badge
- Created `[passageId]/page.tsx` wrapped in FeatureGate:
  - Fetches passage by ID, returns notFound() if missing
  - Marks passage as read via server-side upsert on page load
  - Renders `<ReaderClient initialText={passage.body} hideImport />`
  - "Back to Passages" link at top
- Modified `ReaderClient.tsx`: Added `hideImport?: boolean` prop; wraps ImportDialog in `{!hideImport && ...}`
- Modified `ReaderToolbar.tsx`: Made `onImportClick` optional; conditionally renders Import button and separator

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No shadcn Table component available**
- **Found during:** Task 1
- **Issue:** Plan specified using shadcn/ui Table components but `@/components/ui/table` does not exist in the project
- **Fix:** Used div-based CSS grid layout with matching visual styling
- **Files modified:** AdminReaderClient.tsx
- **Commit:** 321de0a

**2. [Rule 2 - Missing functionality] Import button still visible in toolbar**
- **Found during:** Task 2
- **Issue:** Hiding ImportDialog via hideImport prop still left the Import button visible in ReaderToolbar
- **Fix:** Made `onImportClick` optional in ReaderToolbar, conditionally render Import button and separator
- **Files modified:** src/components/reader/ReaderToolbar.tsx
- **Commit:** 77f656a

## Decisions Made

1. **Option B for hiding ImportDialog**: Added `hideImport` prop to ReaderClient rather than CSS selector targeting -- the ImportDialog is state-controlled, making prop-based hiding cleaner and more reliable
2. **Div-based admin table**: Used CSS grid layout instead of shadcn Table components which don't exist in this project
3. **Toolbar import button conditional**: Made ReaderToolbar's import button fully conditional to prevent showing a non-functional button when hideImport is active

## Verification Results

- TypeScript compilation: PASS (no errors)
- Admin API exports GET, POST, PUT, DELETE: PASS
- All admin handlers contain hasMinimumRole("coach"): PASS
- z.union for single/bulk upload: PASS
- AdminReaderClient is "use client" with file input for JSON: PASS
- Student pages wrapped in FeatureGate: PASS
- ReaderClient rendered with initialText and hideImport: PASS
- Progress API with onConflictDoNothing: PASS
- Read/Unread badge rendering: PASS
