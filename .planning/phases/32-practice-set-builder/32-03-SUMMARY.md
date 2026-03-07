---
phase: 32-practice-set-builder
plan: 03
subsystem: ui
tags: [dnd-kit, drag-and-drop, palette, canvas, sortable, exercise-block, builder-ui]

# Dependency graph
requires:
  - phase: 32-01
    provides: useBuilderState hook, BuilderExercise types, @dnd-kit/react installed
  - phase: 31-practice-data-model-exercise-crud
    provides: ExerciseDefinition types, EXERCISE_TYPE_MAP / LANGUAGE_BADGE patterns
provides:
  - BuilderPalette with 6 draggable exercise type blocks
  - ExerciseBlock collapsed view with type icon, language badge, content preview, unconfigured indicator
  - BuilderCanvas with sortable exercise blocks, drop zone, and editing mode support
affects: [32-04 inline-editing, 32-05 save-sync, builder-client-composition]

# Tech tracking
tech-stack:
  added: []
  patterns: ["useDraggable for palette items with data.source='palette'", "useSortable with group='canvas' for exercise reorder", "useDroppable for canvas drop target", "SortableExerciseItem wrapper pattern for sortable + editing mode"]

key-files:
  created:
    - src/components/admin/builder/BuilderPalette.tsx
    - src/components/admin/builder/ExerciseBlock.tsx
    - src/components/admin/builder/BuilderCanvas.tsx
  modified: []

key-decisions:
  - "Duplicated EXERCISE_TYPE_MAP and LANGUAGE_BADGE from ExerciseList.tsx instead of extracting to shared constants (avoids touching Phase 31 files)"
  - "ExerciseBlock does NOT use useSortable directly; SortableExerciseItem wrapper in BuilderCanvas handles sorting"
  - "Canvas uses useDroppable with type='canvas' as drop target for palette items"
  - "Empty state uses dashed border with PackagePlus icon for drag guidance"

patterns-established:
  - "SortableExerciseItem wrapper: wraps ExerciseBlock in useSortable ref, switches to renderEditor when editing"
  - "PaletteItem pattern: useDraggable with data = { type, source: 'palette' } for cross-zone drag identification"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 32 Plan 03: Palette, Canvas & Exercise Block Summary

**Draggable exercise palette with 6 types using useDraggable, sortable canvas with useSortable, and collapsed ExerciseBlock with type/language/preview/unconfigured indicator**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T17:02:41Z
- **Completed:** 2026-02-06T17:06:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- BuilderPalette renders 6 draggable exercise type blocks (multiple_choice, fill_in_blank, matching, ordering, audio_recording, free_text) using useDraggable from @dnd-kit/react
- ExerciseBlock shows collapsed view with drag handle, type icon, language badge (teal/amber/zinc), content preview, and amber "Needs editing" indicator for unconfigured exercises
- BuilderCanvas provides sortable exercise list using useSortable from @dnd-kit/react/sortable, with droppable zone for palette drops and editing mode support via renderEditor prop

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BuilderPalette and ExerciseBlock components** - `5c78fd5` (feat)
2. **Task 2: Create BuilderCanvas with sortable exercises and DnD integration** - `2df1ed0` (feat)

## Files Created/Modified
- `src/components/admin/builder/BuilderPalette.tsx` - Sidebar palette with 6 draggable exercise type blocks, each using useDraggable
- `src/components/admin/builder/ExerciseBlock.tsx` - Collapsed exercise block with type icon, language badge, content preview, unconfigured indicator, edit/remove actions
- `src/components/admin/builder/BuilderCanvas.tsx` - Sortable canvas with useSortable wrapper, useDroppable drop zone, editing mode, and empty state

## Decisions Made
- Duplicated EXERCISE_TYPE_MAP and LANGUAGE_BADGE constants from ExerciseList.tsx rather than extracting to shared file (avoids modifying Phase 31 code)
- ExerciseBlock is a pure presentational component; sorting is handled by SortableExerciseItem wrapper in BuilderCanvas
- Canvas empty state shows "Drag exercise types from the palette to add questions" with dashed border
- DragDropProvider and onDragEnd/onDragOver handlers are NOT in these components -- they go in the parent BuilderClient (Plan 05)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three builder UI components ready for composition in BuilderClient (Plan 05)
- Palette items emit data.source='palette' for DragDropProvider to detect palette-to-canvas drops
- Canvas sortable items use group='canvas' for onDragOver reorder via move() helper
- renderEditor prop enables inline editing integration (Plan 04)

## Self-Check: PASSED

---
*Phase: 32-practice-set-builder*
*Completed: 2026-02-06*
