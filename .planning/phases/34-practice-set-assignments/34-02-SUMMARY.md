---
phase: 34-practice-set-assignments
plan: 02
subsystem: ui
tags: [react, dialog, cascading-selects, assignments, practice-sets, shadcn]

# Dependency graph
requires:
  - phase: 34-practice-set-assignments-01
    provides: Assignment CRUD library, admin API routes (POST/GET/DELETE), listAssignmentsForSet
  - phase: 32-exercise-builder
    provides: ExerciseListClient, practice_sets schema, PracticeSet type
provides:
  - AssignmentDialog component with cascading target selection and due date
  - AssignmentList component for displaying/deleting existing assignments
  - Targets API route for cascading selects (courses, modules, lessons, students, tags)
  - "Assign" button on published practice sets in ExerciseListClient
affects: [34-03 student dashboard, 35-student-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cascading select pattern: parent selection triggers child data fetch via API"
    - "Dialog for form-based interactions (not AlertDialog which is for confirmations)"

key-files:
  created:
    - src/app/api/admin/assignments/targets/route.ts
    - src/components/practice/assignments/AssignmentDialog.tsx
    - src/components/practice/assignments/AssignmentList.tsx
  modified:
    - src/app/(dashboard)/admin/exercises/ExerciseListClient.tsx

key-decisions:
  - "Dialog (not AlertDialog) for assignment form — Dialog is for forms, AlertDialog for confirmations"
  - "Cascading selects fetch targets on-demand via /api/admin/assignments/targets endpoint"
  - "Published-only gate: Assign button only shown for sets with status 'published'"
  - "Target type badge colors: blue=course, purple=module, amber=lesson, green=student, rose=tag"

patterns-established:
  - "Cascading select pattern: course->module->lesson hierarchy with parentId API param"
  - "Assignment management dialog pattern: create + list + delete in single dialog"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 34 Plan 02: Coach Assignment UI Summary

**AssignmentDialog with cascading selects for 5 target types, AssignmentList with delete, and "Assign" button on published practice sets in ExerciseListClient**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-07T03:27:35Z
- **Completed:** 2026-02-07T03:33:08Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 1

## Accomplishments
- Targets API endpoint returning courses, modules, lessons, students, or tags with cascading parentId support
- AssignmentDialog with 5 target type options, cascading course->module->lesson selects, student/tag pickers, optional due date, and existing assignment management
- AssignmentList displaying assignment rows with colored type badges, truncated IDs, due dates, and delete buttons
- ExerciseListClient integration: "Assign" button only on published practice sets, opening the dialog

## Task Commits

Each task was committed atomically:

1. **Task 1: Targets API route for cascading selects** - `60ec1cd` (feat)
2. **Task 2: AssignmentDialog, AssignmentList, ExerciseListClient integration** - `1d8c030` (feat)

## Files Created/Modified
- `src/app/api/admin/assignments/targets/route.ts` - GET endpoint returning filterable target entities for cascading select dropdowns
- `src/components/practice/assignments/AssignmentDialog.tsx` - Modal dialog for creating and managing assignments with cascading selects, due date, error handling
- `src/components/practice/assignments/AssignmentList.tsx` - List of existing assignments with type badges, due dates, and delete capability
- `src/app/(dashboard)/admin/exercises/ExerciseListClient.tsx` - Added "Assign" button for published sets and AssignmentDialog integration

## Decisions Made
- Used Dialog (shadcn) instead of AlertDialog for the assignment form since Dialog is for interactive forms while AlertDialog is for confirmations
- Cascading selects fetch targets on-demand via dedicated `/api/admin/assignments/targets` endpoint rather than loading all data upfront
- Published-only gate: "Assign" button conditionally rendered only for `set.status === 'published'`
- Target type badge colors follow consistent scheme: blue=course, purple=module, amber=lesson, green=student, rose=tag
- Success/error messages shown inline in dialog (not toast) for simpler implementation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn Dialog component was not generated**
- **Found during:** Pre-task setup
- **Issue:** `src/components/ui/dialog.tsx` did not exist as a generated file (the file existed but wasn't found by initial glob)
- **Fix:** Ran `npx shadcn@latest add dialog --yes` which confirmed the file already existed
- **Files modified:** None (file was already present)
- **Verification:** Import resolves correctly, TypeScript compiles clean

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal - the dialog component was already available. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Assignment dialog fully functional for coach workflow (create, list, delete assignments)
- Targets API ready for any future cascading select needs
- Student dashboard (Plan 03) can now build on the assignment data created through this UI

## Self-Check: PASSED

---
*Phase: 34-practice-set-assignments*
*Completed: 2026-02-07*
