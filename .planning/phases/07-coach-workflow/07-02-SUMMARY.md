---
phase: 07-coach-workflow
plan: 02
subsystem: coach-interface
tags: [dashboard, submissions, queue, ui-components]
depends_on:
  requires: ["07-01"]
  provides: ["coach-dashboard", "submission-queue", "submission-detail-page"]
  affects: ["07-03"]
tech_stack:
  added: []
  patterns: ["server-component-auth", "client-fetch-api", "responsive-grid-layout"]
key_files:
  created:
    - src/app/(dashboard)/coach/page.tsx
    - src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx
    - src/components/coach/SubmissionQueue.tsx
    - src/components/coach/SubmissionCard.tsx
  modified: []
decisions:
  - id: "07-02-01"
    choice: "Server-side role check with redirect"
    why: "Fail fast - don't render any content if user lacks access"
  - id: "07-02-02"
    choice: "Client-side fetch for submission list with filter tabs"
    why: "Dynamic filtering without full page reload, better UX"
  - id: "07-02-03"
    choice: "Two-column responsive layout for detail page"
    why: "Clear separation between submission info and coach actions"
  - id: "07-02-04"
    choice: "Native HTML5 audio element for playback"
    why: "No extra dependencies, browser-native controls"
metrics:
  duration: 4min
  completed: 2026-01-27
---

# Phase 07 Plan 02: Coach Dashboard UI Summary

**One-liner:** Coach dashboard with submission queue (pending/reviewed/all filters) and detail view with audio playback and AI grading display.

## Completed Tasks

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Create coach dashboard with submission queue | 01c386a | Coach page, SubmissionQueue, SubmissionCard components |
| 2 | Create submission detail page | ddfc7fb | Detail page with student info, audio player, AI grading |

## Implementation Details

### Coach Dashboard Page
- Server component at `/coach` with role check (minimum: coach)
- Redirects students to `/dashboard`
- Renders SubmissionQueue client component
- Personalized greeting with coach's first name

### SubmissionQueue Component
- Client component with status filter tabs (Pending/Reviewed/All)
- Fetches from `/api/submissions` with status parameter
- Loading state with skeleton cards
- Empty state with contextual messaging
- Grid layout: 1 column mobile, 2 tablet, 3 desktop

### SubmissionCard Component
- Displays: student name, lesson title, interaction prompt preview
- Type badge (text=cyan, audio=purple) with icons
- AI score with color coding (red <70, yellow 70-85, green >85)
- Relative time display ("2 hours ago")
- Hover animation with cyan shadow glow
- Links to `/coach/submissions/[id]`

### Submission Detail Page
- Two-column layout: content (2/3) + actions (1/3)
- Student info card with name, email, submission timestamp
- Lesson context with title and interaction prompt
- Submission content:
  - Text: formatted in styled block
  - Audio: native HTML5 player with base64 data URL
  - Transcription display for audio submissions
- AI grading section with visual score bar and feedback
- Right column placeholder for coach feedback (Plan 03)

## API Integration

- `GET /api/submissions?status={status}` - List with filters
- `GET /api/submissions/{id}` - Full submission details
- All routes require minimum coach role

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Prerequisites for Plan 03:**
- Coach feedback schema exists (coachFeedback table from 07-01)
- Submission detail page has placeholder for feedback form
- API routes exist for submission retrieval

**Blockers:** None identified.

## Files Changed

**Created:**
- `src/app/(dashboard)/coach/page.tsx` (49 lines)
- `src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx` (316 lines)
- `src/components/coach/SubmissionQueue.tsx` (192 lines)
- `src/components/coach/SubmissionCard.tsx` (126 lines)

**Total:** 683 lines of new code
