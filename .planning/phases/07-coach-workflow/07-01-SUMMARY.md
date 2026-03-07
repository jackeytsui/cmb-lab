---
phase: 07-coach-workflow
plan: 01
subsystem: coach-workflow
tags: [database, schema, api, submissions, drizzle]

dependency_graph:
  requires: [01-01, 03-01, 06-02]
  provides: [submissions-schema, submissions-api, grading-capture]
  affects: [07-02, 07-03]

tech_stack:
  added: []
  patterns:
    - pgEnum for submission_type, submission_status, note_visibility
    - cascade delete on all foreign keys
    - base64 encoding for inline audio storage
    - graceful error handling for non-critical operations

key_files:
  created:
    - src/db/schema/submissions.ts
    - src/db/schema/notes.ts
    - src/app/api/submissions/route.ts
    - src/app/api/submissions/[submissionId]/route.ts
  modified:
    - src/db/schema/index.ts
    - src/app/api/grade/route.ts
    - src/app/api/grade-audio/route.ts

decisions:
  - id: base64-audio-storage
    choice: Store audio as base64 in text column
    reason: v1 simplicity - no external storage infrastructure needed
  - id: capture-threshold
    choice: Text submissions captured when score < 85
    reason: Focus coach attention on struggling students
  - id: capture-all-audio
    choice: ALL audio submissions captured regardless of score
    reason: Coaches want to review pronunciation for all students
  - id: graceful-capture
    choice: Submission capture failures logged but don't fail grading
    reason: Core grading must work even if capture has issues

metrics:
  duration: 3min
  completed: 2026-01-27
---

# Phase 7 Plan 1: Submissions Data Foundation Summary

Database schema for coach workflow submissions with API endpoints and grading capture wiring.

## What Was Built

### Database Schema

**submissions table** (`src/db/schema/submissions.ts`):
- Captures student work for coach review
- `type`: pgEnum "submission_type" (text, audio)
- `status`: pgEnum "submission_status" (pending_review, reviewed, archived)
- `audioData`: text field for base64-encoded audio (v1 inline storage)
- FKs to users, interactions, lessons (all cascade delete)
- `reviewedAt`, `reviewedBy` for tracking coach review

**coachFeedback table**:
- One feedback per submission (unique constraint)
- `loomUrl`: text for Loom video links
- `feedbackText`: written feedback
- FK to coach user

**coachNotes table** (`src/db/schema/notes.ts`):
- Internal or shared notes about students
- `visibility`: pgEnum "note_visibility" (internal, shared)
- Optional link to specific submission
- FKs to coach user and student user

### API Routes

**GET /api/submissions** (`src/app/api/submissions/route.ts`):
- Lists submissions with filters (status, studentId, limit, offset)
- Returns submission with student/lesson/interaction info via joins
- Requires coach role minimum
- Default status filter: "pending_review"

**GET /api/submissions/[submissionId]** (`src/app/api/submissions/[submissionId]/route.ts`):
- Full submission details with related data
- Includes coach feedback and notes if present
- Returns 404 if submission not found
- Requires coach role minimum

### Grading Capture Wiring

**Text grading** (`src/app/api/grade/route.ts`):
- Captures submission when `score < 85` (struggling students)
- Looks up database user ID from Clerk ID
- Queries interaction to get lessonId
- Graceful error handling (grading still works if capture fails)

**Audio grading** (`src/app/api/grade-audio/route.ts`):
- Captures ALL audio submissions (coaches review pronunciation)
- Converts audio file to base64 for storage
- Preserves transcription from grading response
- Works in both mock and production modes

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio storage | base64 in text column | v1 simplicity - no S3/GCS setup needed |
| Text capture threshold | score < 85 | Focus coach time on students who need help |
| Audio capture | All submissions | Pronunciation review valuable regardless of score |
| Capture errors | Log, don't fail | Core grading function must remain reliable |

## Commits

| Hash | Description |
|------|-------------|
| 1c4e64f | feat(07-01): create submissions and coach notes schema |
| ee46c94 | feat(07-01): create submissions API routes |
| e5d66be | feat(07-01): wire submission capture to grading flow |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**For 07-02 (Coach Review Dashboard):**
- Submissions schema ready for querying
- API endpoints ready for frontend consumption
- Status tracking (pending_review, reviewed, archived) ready for filtering

**For 07-03 (Feedback Delivery):**
- coachFeedback table ready for Loom URL and text storage
- coachNotes table ready for internal and shared notes
- Unique constraint ensures one feedback per submission

## Testing Notes

To test submission capture:
1. Ensure DATABASE_URL is configured
2. Run database migration: `npx drizzle-kit push`
3. Make a text interaction with score < 85 (via n8n webhook)
4. Make any audio interaction (all captured)
5. Query GET /api/submissions to see captured submissions

Note: Mock responses (score 85) won't trigger text capture but will trigger audio capture.
