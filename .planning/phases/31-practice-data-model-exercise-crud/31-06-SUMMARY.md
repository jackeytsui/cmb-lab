---
phase: 31-practice-data-model-exercise-crud
plan: 06
subsystem: admin-ui
tags: [next.js, server-components, crud, admin, exercises, practice-sets]
depends_on: ["31-02", "31-03", "31-04", "31-05"]
provides:
  - Admin exercise management pages (list, create, edit)
  - Admin dashboard navigation link to exercises
  - ExerciseForm fully wired with all 6 sub-form components
affects:
  - Phase 33 (Practice Set Player) will consume these exercises on student side
  - Phase 32 (Practice Set Assignments) will build on practice set management
tech-stack:
  added: []
  patterns:
    - Server component DB query with client component mutation (no self-fetch anti-pattern)
    - Collapsible practice set sections with inline exercise lists
    - Shared ExerciseFormClient/EditExerciseClient wrappers for navigation callbacks
    - Tabs (shadcn) for Edit/Preview switching on edit page
key-files:
  created:
    - src/app/(dashboard)/admin/exercises/page.tsx
    - src/app/(dashboard)/admin/exercises/ExerciseListClient.tsx
    - src/app/(dashboard)/admin/exercises/ExerciseFormClient.tsx
    - src/app/(dashboard)/admin/exercises/new/page.tsx
    - src/app/(dashboard)/admin/exercises/[exerciseId]/page.tsx
    - src/app/(dashboard)/admin/exercises/[exerciseId]/EditExerciseClient.tsx
  modified:
    - src/app/(dashboard)/admin/page.tsx
    - src/components/admin/exercises/ExerciseForm.tsx
decisions:
  - Inline form for new practice set creation (not a separate page/dialog)
  - ExerciseListClient receives all data as props from server component
  - Edit page uses shadcn Tabs for Edit/Preview toggle
  - Practice Exercises card uses emerald color scheme on admin dashboard
metrics:
  duration: 4 min
  completed: 2026-02-06
---

# Phase 31 Plan 06: Admin Exercise Pages & Dashboard Nav Summary

Admin exercise management pages with server-side DB queries, collapsible practice set sections, Edit/Preview tabs, and ExerciseForm upgraded from placeholders to all 6 real sub-form imports.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Exercise list page and new exercise page | c28a5b0 | page.tsx, ExerciseListClient.tsx, ExerciseFormClient.tsx, new/page.tsx |
| 2 | Edit exercise page, admin nav card, ExerciseForm imports | 7435119 | [exerciseId]/page.tsx, EditExerciseClient.tsx, admin/page.tsx, ExerciseForm.tsx |

## What Was Built

### Exercise List Page (`/admin/exercises`)
- Server component queries `practiceSets` and `practiceExercises` directly from DB (no self-fetch anti-pattern)
- Passes data as props to `ExerciseListClient` -- client handles mutations only
- Collapsible sections per practice set with status badges (draft/published/archived)
- Exercise count per set, expand/collapse with chevron icons
- "New Practice Set" button with inline creation form (title input, POST to API)
- "Add Exercise" button per set links to `/admin/exercises/new?setId=xxx`
- Delete exercise via API with AlertDialog confirmation (from ExerciseList component)
- Empty state when no practice sets exist

### New Exercise Page (`/admin/exercises/new`)
- Reads `setId` from searchParams to determine target practice set
- If no setId: shows practice set selector grid for choosing target
- If setId: verifies set exists, shows "Adding to: [title]" context
- Renders ExerciseFormClient wrapping ExerciseForm with navigation callbacks
- Back link to exercises list

### Edit Exercise Page (`/admin/exercises/[exerciseId]`)
- Server component fetches exercise + parent practice set from DB
- "Part of: [Practice Set Title]" context label
- Tabs component (shadcn) switching between Edit and Preview views
- Edit tab: ExerciseForm pre-filled with existing exercise data
- Preview tab: ExercisePreview showing student-perspective view
- notFound() if exercise doesn't exist or is deleted

### Admin Dashboard Update
- Added "Practice Exercises" navigation card with emerald color scheme and ClipboardList icon
- Added practice set count to stats section (parallel DB query)
- Card positioned between Content Management and Knowledge Base

### ExerciseForm Upgrade
- Replaced 4 placeholder divs with actual component imports:
  - MatchingPairsForm, OrderingForm, AudioRecordingForm, FreeTextForm
- All 6 exercise types now fully functional in create/edit forms
- Removed commented-out import lines

## Data Flow Architecture

```
page.tsx (server) ─── DB query ──→ practiceSets[] + exercises[]
    │
    └── ExerciseListClient (client) ─── props ──→ renders ExerciseList
            │
            ├── Edit click → router.push(/admin/exercises/[id])
            ├── Delete click → DELETE /api/admin/exercises/[id] → router.refresh()
            └── Add Exercise → router.push(/admin/exercises/new?setId=xxx)
```

## Decisions Made

1. **Inline form for new practice set** -- Simple form with title input appears inline below the "New Practice Set" button, avoiding navigation to a separate page
2. **Server component DB queries** -- All page-level data fetching happens in server components to avoid the self-fetch 401 anti-pattern
3. **Edit/Preview tabs** -- Used shadcn Tabs component for toggling between form editing and student-view preview
4. **Emerald color for exercises card** -- Matches the practice/exercise theme while being distinct from existing admin card colors (blue, amber, purple, green, cyan, orange, teal)
5. **All sets expanded by default** -- ExerciseListClient initializes with all practice sets expanded for immediate visibility

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` passes cleanly (no errors)
- All key_links patterns verified (ExerciseList import, ExerciseForm import, DB query pattern, prop passing)
- Admin dashboard contains "exercises" link
- All artifact min_lines requirements met (page.tsx: 63, new/page.tsx: 135, [exerciseId]/page.tsx: 94)

## Next Phase Readiness

This completes the CRUD loop for Phase 31. The exercise management system is fully functional from the admin UI:
- List practice sets with exercises
- Create new practice sets
- Create exercises of all 6 types
- Edit existing exercises with preview
- Delete exercises with confirmation

Remaining for Phase 31: none -- all 6 plans complete.
Next: Phase 32 (Practice Set Assignments) or Phase 33 (Practice Set Player for students).

## Self-Check: PASSED
