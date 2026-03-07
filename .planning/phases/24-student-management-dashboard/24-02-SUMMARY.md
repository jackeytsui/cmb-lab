---
phase: 24-student-management-dashboard
plan: 02
subsystem: admin-ui
tags: [tanstack-table, data-table, react, client-component]
dependency_graph:
  requires: []
  provides: [StudentDataTable component, column definitions, StudentRow type]
  affects: [24-03, 24-05, 24-06]
tech_stack:
  added: ["@tanstack/react-table@8.21.3"]
  patterns: [manual-pagination, manual-sorting, url-synced-state, row-selection]
key_files:
  created:
    - src/components/admin/columns.tsx
    - src/components/admin/StudentDataTable.tsx
  modified:
    - package.json
    - package-lock.json
decisions:
  - id: dt-columns
    decision: "7 columns: select, name, courses, progress, lastActive, tags, joined (hidden)"
    rationale: "Covers core student data; joined hidden by default to reduce clutter"
  - id: dt-url-sync
    decision: "Pagination and sorting synced to URL search params via router.replace"
    rationale: "Enables shareable URLs and server-side data fetching in Plan 03"
  - id: dt-debounce
    decision: "300ms debounce on search input using setTimeout ref pattern"
    rationale: "use-debounce already in deps but manual approach avoids extra import overhead for simple case"
metrics:
  duration: "2min 32s"
  completed: "2026-01-31"
---

# Phase 24 Plan 02: TanStack Table & Column Definitions Summary

**TL;DR:** Installed TanStack Table v8 and built StudentDataTable client component with 7 column definitions, URL-synced pagination/sorting, row selection, and debounced search.

## What Was Built

### Column Definitions (`src/components/admin/columns.tsx`)
- **StudentRow interface** with enriched fields: id, clerkId, email, name, createdAt, coursesEnrolled, completionPercent, lastActive, tags
- **7 columns** defined as `ColumnDef<StudentRow>[]`:
  1. **select** - Checkbox with indeterminate state for bulk selection
  2. **name** - Avatar icon + name + email subtitle
  3. **coursesEnrolled** - Simple number display (sorting disabled)
  4. **completionPercent** - Inline progress bar with cyan fill + percentage text
  5. **lastActive** - Relative time with color-coded staleness (green/amber/red)
  6. **tags** - Colored dot + name badges, max 3 visible + overflow count
  7. **createdAt** - Relative time, hidden by default

### StudentDataTable Component (`src/components/admin/StudentDataTable.tsx`)
- **useReactTable** with `manualPagination` and `manualSorting` (server-driven)
- **URL sync** via `router.replace()` for page, pageSize, sortBy, sortOrder, search params
- **Debounced search** (300ms) with local input state
- **Row selection** with checkbox column and bulk selection bar showing count
- **Clickable rows** navigate to `/admin/students/{id}` (except checkbox clicks)
- **Pagination controls** with prev/next, page X of Y, page size selector (10/25/50/100)
- **Sort indicators** on headers (chevron up/down/unsorted)
- **Empty state** with contextual message (search vs no data)
- **Dark theme** matching existing admin pages (zinc-900, zinc-800 borders, cyan accents)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | c3d91db | feat(24-02): install TanStack Table and create column definitions |
| 2 | c40c955 | feat(24-02): build StudentDataTable component with TanStack Table |

## Next Phase Readiness

- Plan 03 can mount `<StudentDataTable>` with server-fetched data
- Plan 05 can wire bulk actions using `getSelectedStudentIds` helper
- Plan 06 can add filter preset UI to the filter bar placeholder
