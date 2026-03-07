---
phase: 07-coach-workflow
plan: 05
completed: 2026-01-27

subsystem: coach-access-management
tags: [api, ui, access-control, coach-workflow]

dependency_graph:
  requires: [07-01]
  provides: [student-access-api, student-access-ui, coach-students-page]
  affects: []

tech_stack:
  added: []
  patterns:
    - Expandable list rows with AnimatePresence
    - Inline confirmation dialogs for destructive actions
    - UUID validation for API parameters

file_tracking:
  key_files:
    created:
      - src/app/api/students/[studentId]/access/route.ts
      - src/components/coach/StudentAccessManager.tsx
      - src/app/(dashboard)/coach/students/page.tsx
      - src/app/(dashboard)/coach/students/StudentList.tsx
    modified: []

decisions:
  - id: COACH-05-01
    choice: "Expandable rows for student access management"
    reason: "Simpler than modal or navigation approach, keeps context visible"
    alternatives: ["Modal dialog", "Separate page per student"]

metrics:
  duration: 4min
---

# Phase 07 Plan 05: Student Access Management Summary

**One-liner:** Coach student access management with API routes for grant/revoke and expandable row UI for inline management.

## What Was Built

### 1. Student Access API Routes (`src/app/api/students/[studentId]/access/route.ts`)

Three REST endpoints for managing student course access:

- **GET** - List student's course access with joined course info
- **POST** - Grant course access with tier and optional expiry
- **DELETE** - Revoke course access by courseId query param

Key features:
- Coach role minimum required for all endpoints
- UUID validation for studentId and courseId parameters
- Student role validation (only manage actual students)
- 409 Conflict response when granting duplicate access
- Proper error handling with descriptive messages

### 2. StudentAccessManager Component (`src/components/coach/StudentAccessManager.tsx`)

Client component for viewing and managing a student's course access:

- Displays current access with tier badges (full=green, preview=yellow)
- Shows granted-by source and expiry dates
- Course dropdown filtered to show only ungranted courses
- Access tier selection (Full Access / Preview Only)
- Optional expiry date picker with future-date validation
- Inline confirmation dialog for revoke actions
- Skeleton loading states

### 3. Coach Students Page (`src/app/(dashboard)/coach/students/page.tsx`)

Server component for the student list view:

- Requires coach role minimum (redirects others to dashboard)
- Queries all students with LEFT JOIN to get access counts
- Displays empty state when no students registered
- Passes data to StudentList client component

### 4. StudentList Component (`src/app/(dashboard)/coach/students/StudentList.tsx`)

Client component with expandable rows:

- Displays student avatar placeholder, name, email
- Shows course access count badge
- Expand/collapse with ChevronRight/ChevronDown icons
- AnimatePresence for smooth expand/collapse animations
- Embeds StudentAccessManager when expanded

## Verification Results

| Criterion | Status |
|-----------|--------|
| GET /api/students/[id]/access returns access | Passed |
| POST /api/students/[id]/access grants access | Passed |
| DELETE /api/students/[id]/access revokes access | Passed |
| Coach can view /coach/students page | Passed |
| Coach can grant access via UI | Passed |
| Coach can revoke access via UI | Passed |
| Non-coach users cannot access features | Passed |
| TypeScript compiles | Passed |
| StudentAccessManager min 60 lines | Passed (417 lines) |
| Students page min 50 lines | Passed (117 lines) |

## Key Links Verified

| From | To | Pattern |
|------|-----|---------|
| route.ts | access.ts | `.insert(courseAccess)` at line 212 |
| route.ts | access.ts | `.delete(courseAccess)` at line 316 |
| StudentAccessManager | /api/students | `fetch('/api/students/${studentId}/access` at lines 65, 105 |

## Commits

| Hash | Message |
|------|---------|
| 02ec502 | feat(07-05): add student access API routes |
| fa4682d | feat(07-05): add student access management UI |

## Deviations from Plan

None - plan executed exactly as written.

## Next Steps

Phase 07 coach workflow is now complete with all planned functionality:
- Submission queue and detail views
- Coach feedback (Loom and text)
- Coach notes (internal and shared)
- Email notifications for feedback
- Student access management

Ready for Phase 08 (Admin Console) or Phase 09 (Polish and Deployment).
