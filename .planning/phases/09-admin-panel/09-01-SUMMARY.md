---
phase: "09"
plan: "01"
subsystem: admin-panel
tags: [admin, crud, forms, navigation, courses, modules, lessons]

# What this plan built on
requires:
  - 01-foundation (database schema for courses, modules, lessons)
  - 07-coach-workflow (auth patterns, role-based access)

# What this plan delivers
provides:
  - Admin content management API routes
  - Course/Module/Lesson CRUD operations
  - Admin form components for content editing
  - Admin pages with navigation hierarchy
  - Module and lesson reorder functionality

# What might need this in future
affects:
  - 09-02 (interaction editor integration into lesson detail page)
  - 09-03 (student management and AI logs)

# Tech additions
tech-stack:
  added: []
  patterns:
    - Soft delete with deletedAt timestamp
    - Collapsible edit forms in detail pages
    - Up/down reorder buttons with optimistic updates
    - Breadcrumb navigation for deep hierarchies

# Files
key-files:
  created:
    - src/app/api/admin/courses/route.ts
    - src/app/api/admin/courses/[courseId]/route.ts
    - src/app/api/admin/modules/route.ts
    - src/app/api/admin/modules/[moduleId]/route.ts
    - src/app/api/admin/modules/reorder/route.ts
    - src/app/api/admin/lessons/route.ts
    - src/app/api/admin/lessons/[lessonId]/route.ts
    - src/app/api/admin/lessons/reorder/route.ts
    - src/components/admin/CourseForm.tsx
    - src/components/admin/ModuleForm.tsx
    - src/components/admin/LessonForm.tsx
    - src/components/admin/ContentList.tsx
    - src/app/(dashboard)/admin/page.tsx
    - src/app/(dashboard)/admin/courses/page.tsx
    - src/app/(dashboard)/admin/courses/new/page.tsx
    - src/app/(dashboard)/admin/courses/[courseId]/page.tsx
    - src/app/(dashboard)/admin/courses/[courseId]/modules/new/page.tsx
    - src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/page.tsx
    - src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/lessons/new/page.tsx
    - src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/lessons/[lessonId]/page.tsx
  modified: []

# Decisions
decisions:
  - id: admin-soft-delete
    choice: "deletedAt timestamp for soft delete"
    reason: "Preserve data for audit, allow restoration"
  - id: admin-reorder-ui
    choice: "Up/down buttons instead of drag-and-drop"
    reason: "Simpler implementation, works on mobile, accessible"
  - id: admin-collapsible-forms
    choice: "Toggle button to show/hide edit form on detail pages"
    reason: "Cleaner UI, focus on content list when not editing"
  - id: admin-optimistic-reorder
    choice: "Optimistic UI updates for reorder with rollback on error"
    reason: "Instant feedback, better UX"

# Metrics
metrics:
  duration: "10min"
  completed: "2026-01-27"
---

# Phase 9 Plan 1: Admin Content Management Summary

**One-liner:** Complete admin CRUD system for courses, modules, and lessons with API routes, form components, and navigation hierarchy.

## What Was Built

### API Routes (8 files)
- **courses/route.ts**: GET (list with module counts), POST (create with auto-sortOrder)
- **courses/[courseId]/route.ts**: GET (nested modules/lessons), PUT (partial update), DELETE (soft delete)
- **modules/route.ts**: GET (by courseId), POST
- **modules/[moduleId]/route.ts**: GET (with lessons), PUT, DELETE
- **modules/reorder/route.ts**: PATCH (bulk sortOrder update, validates same-course)
- **lessons/route.ts**: GET (by moduleId), POST
- **lessons/[lessonId]/route.ts**: GET, PUT, DELETE
- **lessons/reorder/route.ts**: PATCH (bulk sortOrder update, validates same-module)

All routes protected with `hasMinimumRole("admin")`.

### Form Components (4 files)
- **CourseForm.tsx**: Title (required, min 3), description, thumbnailUrl, isPublished, sortOrder
- **ModuleForm.tsx**: Title (required), description, sortOrder
- **LessonForm.tsx**: Title (required), description, muxPlaybackId, durationSeconds, sortOrder
- **ContentList.tsx**: Generic list with up/down reorder buttons, loading states, optimistic updates

All forms use React Hook Form + Zod validation + dark theme styling.

### Admin Pages (8 files)
- **admin/page.tsx**: Dashboard with stats (courses, lessons, students) and navigation cards
- **admin/courses/page.tsx**: Course list with add/edit/delete
- **admin/courses/new/page.tsx**: Create course form
- **admin/courses/[courseId]/page.tsx**: Course detail with module list and reorder
- **modules/new/page.tsx**: Create module form
- **modules/[moduleId]/page.tsx**: Module detail with lesson list and reorder
- **lessons/new/page.tsx**: Create lesson form
- **lessons/[lessonId]/page.tsx**: Lesson detail with video preview and Interaction Points placeholder

All pages include breadcrumb navigation.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Soft delete | deletedAt timestamp | Preserve data for audit |
| Reorder UI | Up/down buttons | Simpler, accessible, mobile-friendly |
| Detail page forms | Collapsible toggle | Focus on content list when not editing |
| Reorder feedback | Optimistic updates | Instant UX, rollback on error |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All success criteria verified:
1. Admin can create course from /admin/courses/new
2. Admin can edit course from /admin/courses/{id}
3. Admin can soft-delete course (deletedAt set, hidden from list)
4. Admin can create/edit/delete modules within courses
5. Admin can create/edit/delete lessons within modules
6. Admin can reorder modules using up/down buttons
7. Admin can reorder lessons using up/down buttons
8. Navigation breadcrumbs work correctly
9. All pages check admin role before rendering
10. Lesson detail page has placeholder for Interactions section

## Commits

| Hash | Description |
|------|-------------|
| fd04a34 | feat(09-01): add admin API routes for courses, modules, and lessons |
| afdea29 | feat(09-01): add admin form components for content management |
| bdcc2dc | feat(09-01): add admin pages for content management navigation |

## Next Phase Readiness

Plan 02 (Interaction Editor) can now:
- Replace the Interaction Points placeholder in lesson detail page
- Add InteractionEditor component to lesson/[lessonId]/page.tsx
- Use existing lesson API routes for context
