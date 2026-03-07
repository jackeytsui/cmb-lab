---
phase: 32
plan: 05
subsystem: practice-builder
tags: [dnd-kit, drag-drop, builder, batch-save, navigation-guard]
depends_on:
  requires: ["32-01", "32-02", "32-03", "32-04"]
  provides: ["builder-page", "builder-client", "dnd-integration", "batch-save"]
  affects: ["32-06"]
tech-stack:
  added: []
  patterns: ["DragDropProvider-wrapper", "diff-based-batch-save", "beforeunload-guard", "server-exercises-ref"]
key-files:
  created:
    - src/app/(dashboard)/admin/practice-sets/[setId]/builder/page.tsx
    - src/app/(dashboard)/admin/practice-sets/[setId]/builder/BuilderClient.tsx
  modified: []
decisions:
  - "Palette left panel uses BuilderPalette's internal w-60 width (no duplicate width wrapper)"
  - "Reorder dispatches REORDER_EXERCISES to reducer rather than using @dnd-kit/helpers move() — reducer approach is simpler and already handles sortOrder recalculation"
  - "Duplicate confirms unsaved changes before proceeding (uses window.confirm)"
  - "Save refreshes serverExercisesRef via API GET to ensure next diff is accurate"
metrics:
  duration: "2 min"
  completed: "2026-02-06"
---

# Phase 32 Plan 05: Builder Page Assembly Summary

**One-liner:** Full builder page with DragDropProvider wiring, diff-based batch save (create/update/delete), beforeunload guard, and duplicate navigation.

## What Was Built

### Task 1: Builder Server Page
- **File:** `src/app/(dashboard)/admin/practice-sets/[setId]/builder/page.tsx`
- Server component that loads practice set + exercises from DB
- Auth guard: redirects to /dashboard if user lacks coach role
- 404 if practice set not found
- Passes pre-fetched data to BuilderClient

### Task 2: BuilderClient with DnD, Batch Save, Navigation Guards
- **File:** `src/app/(dashboard)/admin/practice-sets/[setId]/builder/BuilderClient.tsx`
- DragDropProvider wraps entire layout
  - `onDragOver`: canvas-to-canvas reorder (dispatches REORDER_EXERCISES)
  - `onDragEnd`: palette-to-canvas drops (dispatches ADD_EXERCISE with language='both')
- 3-panel layout: Palette (left) | Canvas (center) | Preview (right)
- Inline editing: click exercise block to open ExerciseBlockEditor
- Batch save (handleSave):
  - Validates all exercises configured before publish
  - Creates new exercises (temp-* IDs) via POST /api/admin/exercises
  - Updates existing exercises via PUT /api/admin/exercises/[id]
  - Deletes removed exercises via DELETE /api/admin/exercises/[id]
  - Updates practice set meta via PUT /api/admin/practice-sets/[setId]
  - Replaces temp IDs with server IDs via MARK_SAVED dispatch
  - Refreshes serverExercisesRef for next save diff
- Duplicate: calls POST /api/admin/practice-sets/[setId]/duplicate, navigates to new builder
- beforeunload guard fires when isDirty
- Error banner displays save errors

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Builder server page | 1a0b475 | page.tsx |
| 2 | BuilderClient with DnD, save, guards | 11348cd | BuilderClient.tsx |

## Decisions Made

1. **No `move()` from @dnd-kit/helpers** — The reducer's REORDER_EXERCISES action already handles array splice + sortOrder recalculation, making the helper utility redundant.
2. **Palette wrapper is thin** — BuilderPalette already has w-60, border, and bg styling internally. BuilderClient just provides an overflow container and border-r separator.
3. **Duplicate uses window.confirm** — Simple confirm dialog for unsaved changes warning before duplicating (not Radix AlertDialog, since this is a quick guard not a form).
4. **Server exercises ref pattern** — After save, re-fetches exercises from API to update the ref, ensuring the next diff comparison is accurate even if server-side processing modified data.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] Builder server page exists at correct path (server component, no "use client")
- [x] BuilderClient uses DragDropProvider from @dnd-kit/react
- [x] onDragOver handles canvas reorder, onDragEnd handles palette drops
- [x] handleSave performs batch create/update/delete/reorder
- [x] handleDuplicate calls duplicate API and navigates
- [x] beforeunload guard is wired to isDirty
- [x] `npx tsc --noEmit` compiles with zero errors

## Self-Check: PASSED
