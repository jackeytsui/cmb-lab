---
phase: "09"
plan: "02"
subsystem: admin-panel
tags: [admin, interactions, timeline, video, forms, crud]

# What this plan built on
requires:
  - 01-foundation (interactions schema)
  - 09-01 (lesson detail page, admin patterns)

# What this plan delivers
provides:
  - Interaction CRUD API routes
  - Video preview player with timestamp selection
  - Interaction timeline with visual markers
  - Interaction form with Zod validation
  - Integrated interaction editor in lesson detail page

# What might need this in future
affects:
  - 09-03 (may reference interactions for AI log context)

# Tech additions
tech-stack:
  added:
    - shadcn/ui alert-dialog (confirmation dialogs)
  patterns:
    - Timeline visualization with position calculation
    - Two-column responsive editor layout
    - Timestamp conflict detection (2-second minimum)
    - Keyboard shortcuts for video seeking

# Files
key-files:
  created:
    - src/app/api/admin/interactions/route.ts
    - src/app/api/admin/interactions/[interactionId]/route.ts
    - src/components/admin/VideoPreviewPlayer.tsx
    - src/components/admin/InteractionTimeline.tsx
    - src/components/admin/InteractionForm.tsx
    - src/components/ui/alert-dialog.tsx
  modified:
    - src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/lessons/[lessonId]/page.tsx

# Decisions
decisions:
  - id: interaction-timeline-colors
    choice: "Cyan for text, purple for audio markers"
    reason: "Matches existing SubmissionCard color coding for consistency"
  - id: timestamp-conflict-check
    choice: "Require 2 seconds minimum between interactions"
    reason: "Prevents overlapping interaction prompts confusing students"
  - id: form-type-workaround
    choice: "Explicit type instead of z.infer with any resolver cast"
    reason: "Zod v4/react-hook-form type incompatibility workaround"

# Metrics
metrics:
  duration: "8min"
  completed: "2026-01-27"
---

# Phase 9 Plan 2: Interaction Timeline Editor Summary

**One-liner:** Complete interaction editor with video player, timeline visualization, and CRUD form for admins to add pause-and-respond points to lesson videos.

## What Was Built

### API Routes (2 files)
- **interactions/route.ts**: GET (list by lessonId, ordered by timestamp), POST (create with enum validation)
- **interactions/[interactionId]/route.ts**: GET (single), PUT (partial update with conflict detection), DELETE (soft delete via deletedAt)

All routes:
- Require admin role
- Validate enum types (text/audio, cantonese/mandarin/both)
- Return 400 for validation errors with message field
- Timestamp conflict check (2 second minimum separation)

### Components (4 files)
- **VideoPreviewPlayer.tsx**: Mux player with timestamp display, keyboard shortcuts (Space=play/pause, arrows=seek), interaction markers overlay
- **InteractionTimeline.tsx**: Horizontal timeline bar with color-coded markers, tooltip on hover, click to add/edit
- **InteractionForm.tsx**: Zod validation, type/language/prompt/threshold fields, delete confirmation dialog, API error display
- **alert-dialog.tsx**: shadcn/ui component for delete confirmation

### Page Integration
- **lessons/[lessonId]/page.tsx**: Full interaction editor integration
  - Two-column layout on desktop (video+timeline 2/3 | form 1/3)
  - Stacked layout on mobile
  - Fallback message when no video ID
  - Interaction list with selection highlighting
  - Full CRUD flow with optimistic updates

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Timeline colors | Cyan=text, purple=audio | Matches SubmissionCard consistency |
| Timestamp conflict | 2 second minimum | Prevents overlapping prompts |
| Form type fix | Explicit type + `as any` resolver | Zod v4/RHF incompatibility workaround |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All success criteria verified:
1. Admin can view video in lesson detail page
2. Current timestamp displays during playback (MM:SS format)
3. Clicking timeline sets timestamp for new interaction
4. Interaction form accepts all required fields
5. Form validates with Zod schema before submission
6. API 400 errors display in form
7. Created interactions appear as markers on timeline
8. Clicking marker loads interaction into form for editing
9. Delete removes interaction from database and timeline (soft delete)
10. Interactions persist and display correctly on page reload

## Commits

| Hash | Description |
|------|-------------|
| 3ea7835 | feat(09-02): add admin interaction API routes |
| 9a7f974 | feat(09-02): add interaction editor components |
| f4266be | feat(09-02): integrate interaction editor into lesson detail page |

## Next Phase Readiness

Plan 03 (Student Management and AI Logs) can now:
- Reference interactions when displaying AI grading logs
- All admin interaction CRUD is complete
- Phase 9 is now complete (all 3 plans done)
