---
phase: 07-coach-workflow
plan: 03
subsystem: coach-feedback
tags: [api, components, n8n, email, loom, notes]

dependency-graph:
  requires: ["07-01"]
  provides: ["coach-feedback-api", "coach-notes-api", "notification-api", "feedback-form", "notes-panel"]
  affects: ["07-02", "08-*"]

tech-stack:
  added: []
  patterns: ["n8n-webhook-notification", "optimistic-updates", "visibility-filtering"]

key-files:
  created:
    - src/app/api/submissions/[submissionId]/feedback/route.ts
    - src/app/api/submissions/[submissionId]/notes/route.ts
    - src/app/api/notify/coach-feedback/route.ts
    - src/components/coach/CoachFeedbackForm.tsx
    - src/components/coach/CoachNotesPanel.tsx
    - src/components/ui/textarea.tsx
  modified: []

decisions:
  - id: loom-url-validation
    choice: "Validate hostname is loom.com, www.loom.com, or share.loom.com"
    why: "Ensures only valid Loom links accepted"
  - id: notification-fire-and-forget
    choice: "Email notification triggered async, failures logged but don't fail request"
    why: "Feedback save should succeed even if notification fails"
  - id: delete-own-notes-only
    choice: "Coaches can only delete their own notes"
    why: "Prevents accidental deletion of colleague notes"
  - id: visibility-filter-default
    choice: "Default filter shows all notes, can filter by internal/shared"
    why: "Coaches need full context by default"

metrics:
  duration: 3min
  completed: 2026-01-27
---

# Phase 07 Plan 03: Coach Feedback and Notes UI Summary

Coach Loom feedback, text feedback, and internal/shared notes system with email notifications via n8n.

## What Was Built

### API Routes (Task 1)

**Feedback API** (`/api/submissions/[submissionId]/feedback`):
- POST: Save Loom URL and/or text feedback, update submission status to "reviewed"
- GET: Retrieve existing feedback for submission
- Validates Loom URL format (must be loom.com domain)
- Triggers email notification via internal API call

**Notes API** (`/api/submissions/[submissionId]/notes`):
- POST: Create note with visibility (internal/shared)
- GET: List all notes for submission with coach info
- DELETE: Remove note (own notes only)

**Notification API** (`/api/notify/coach-feedback`):
- Internal endpoint triggered by feedback route
- Calls N8N_COACH_FEEDBACK_WEBHOOK_URL if configured
- Dev mode logs notification details and returns success

### UI Components (Task 2)

**CoachFeedbackForm** (195 lines):
- Loom URL input with validation
- Feedback text textarea
- Loading/error/success states
- Shows existing feedback as read-only after submission
- Edit button to modify existing feedback

**CoachNotesPanel** (319 lines):
- Notes list with visibility badges (internal=gray, shared=blue)
- Add note form with visibility selector
- Visibility filter (all/internal/shared)
- Delete button for own notes only
- Optimistic updates with rollback on failure
- Timestamps with coach name

**Textarea Component** (added to shadcn/ui):
- Matches Input component styling
- Supports resize and rows props

## Key Implementation Details

### Loom URL Validation
```typescript
function isValidLoomUrl(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.hostname === "loom.com" ||
    parsed.hostname === "www.loom.com" ||
    parsed.hostname === "share.loom.com"
  );
}
```

### Notification Pattern (follows /api/grade)
- 15 second timeout with AbortController
- Auth header if N8N_WEBHOOK_AUTH_HEADER configured
- Dev mode warning when webhook URL not set

### Visibility System
- Internal notes: Only coaches can see
- Shared notes: Students can also see
- Visual distinction: gray badge (internal), blue badge (shared)

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/api/submissions/[submissionId]/feedback/route.ts` | 169 | Feedback CRUD + notification trigger |
| `src/app/api/submissions/[submissionId]/notes/route.ts` | 158 | Notes CRUD with ownership check |
| `src/app/api/notify/coach-feedback/route.ts` | 89 | n8n webhook notification |
| `src/components/coach/CoachFeedbackForm.tsx` | 195 | Loom + text feedback form |
| `src/components/coach/CoachNotesPanel.tsx` | 319 | Notes list with add/delete |
| `src/components/ui/textarea.tsx` | 20 | shadcn/ui Textarea component |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 40f7297 | feat | Add coach feedback and notes API routes |
| 0e24655 | feat | Add coach feedback form and notes panel components |

## Deviations from Plan

### Auto-added (Rule 2 - Missing Critical)

**1. Textarea UI Component**
- **Found during:** Task 2
- **Issue:** No Textarea component existed in shadcn/ui components
- **Fix:** Created src/components/ui/textarea.tsx matching Input styling
- **Commit:** 0e24655

## Verification Results

All must-haves verified:

- [x] Coach can attach Loom video URL to submission
- [x] Coach can write text feedback on submission
- [x] Coach can add internal notes (coach-only visibility)
- [x] Coach can add shared notes (student-visible)
- [x] Email notification triggers when coach submits feedback
- [x] Feedback API at correct path with POST/GET
- [x] Notes API at correct path with POST/GET/DELETE
- [x] Notification API calls n8n webhook
- [x] CoachFeedbackForm component 60+ lines (195 lines)
- [x] CoachNotesPanel component 80+ lines (319 lines)
- [x] Key link: insert coachFeedback pattern present
- [x] Key link: fetch notify/coach-feedback pattern present

## Environment Variables Required

```bash
# Optional - email notifications skip if not configured
N8N_COACH_FEEDBACK_WEBHOOK_URL="https://your-n8n.app/webhook/coach-feedback"
N8N_WEBHOOK_AUTH_HEADER="Bearer your-token"  # Optional auth
```

## n8n Workflow Setup

Create workflow that receives webhook POST:
```json
{
  "studentEmail": "student@example.com",
  "studentName": "John Student",
  "lessonTitle": "Lesson 1: Basics",
  "coachName": "Jane Coach",
  "loomUrl": "https://www.loom.com/share/abc123",
  "feedbackText": "Great work on..."
}
```

Workflow should send email notification to student.

## Next Phase Readiness

Ready for:
- 07-02: Coach dashboard page (can use these components)
- Phase 8: Admin features

No blockers identified.
