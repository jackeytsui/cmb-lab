---
phase: 24-student-management-dashboard
plan: 03
subsystem: admin-pages
tags: [server-components, searchparams, activity-timeline, student-detail]
dependency_graph:
  requires: [24-01, 24-02]
  provides: [wired students page, activity timeline, coach+ access]
  affects: [24-04, 24-05, 24-06]
tech_stack:
  added: []
  patterns: [searchparams-driven-ssr, parallel-data-fetching, unified-activity-timeline]
key_files:
  created: []
  modified:
    - src/app/(dashboard)/admin/students/page.tsx
    - src/app/(dashboard)/admin/students/[studentId]/page.tsx
decisions:
  - id: coach-access-students
    description: "Changed both students pages from admin-only to coach+ role for coaching workflow"
    rationale: "Coaches need to view and manage students; matches API route access level"
metrics:
  duration: 2min
  completed: 2026-01-31
---

# Phase 24 Plan 03: Server Page Wiring & Activity Timeline Summary

Server-side students page wired to getStudentsPageData with URL searchParams driving pagination/sorting/search/filters; student detail page enhanced with activity timeline showing lesson completions, submissions, and AI conversations.

## What Was Built

### Task 1: Rewrite admin students page with searchParams and StudentDataTable
- Replaced inline DB queries with `getStudentsPageData` from `student-queries.ts`
- Page receives `searchParams` as a Promise (Next.js 16 pattern), parses page/pageSize/sortBy/sortOrder/search/tagIds/courseId/atRisk
- Passes enriched data to `StudentDataTable` component (from Plan 02)
- Dynamic total count displayed in page subtitle
- Changed access from `hasMinimumRole("admin")` to `hasMinimumRole("coach")`
- Removed `StudentList` import (component still exists for potential other references)

### Task 2: Add activity timeline to student detail page
- Created `getActivityTimeline(studentId)` async function querying 3 tables in parallel:
  - `lessonProgress` joined with `lessons` for completion/access events
  - `submissions` joined with `lessons` for submission events
  - `conversations` joined with `lessons` for AI conversation events
- Builds unified `ActivityEvent[]` sorted by timestamp descending, limited to 50
- `ActivityTimeline` component with vertical timeline UI:
  - Green (CheckCircle) for lesson completions
  - Cyan (Eye) for lesson access
  - Amber (FileText) for submissions
  - Purple (MessageSquare) for AI conversations
- Empty state with descriptive message
- Relative timestamps with full date on hover
- Changed access from admin-only to coach+ role

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit` passes)
- Both pages use coach+ access control
- Students page wires searchParams to getStudentsPageData
- StudentDataTable receives enriched server data
- Student detail page includes Activity Timeline section between Tags and GHL Profile

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a22a369 | feat(24-03): rewrite students page with searchParams and StudentDataTable |
| 2 | a352224 | feat(24-03): add activity timeline to student detail page |
