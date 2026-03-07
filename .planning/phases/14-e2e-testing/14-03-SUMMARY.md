---
phase: 14-e2e-testing
plan: 03
subsystem: testing
tags: [playwright, e2e, lesson-completion, coach-review, page-object-model, route-mocking]

# Dependency graph
requires:
  - phase: 14-e2e-testing-01
    provides: Playwright framework, auth fixtures, helpers, Page Object Models
  - phase: 04-progress-system
    provides: Lesson progress tracking API
  - phase: 07-coach-workflow
    provides: Coach submission queue, feedback form, notes panel
provides:
  - Student lesson completion E2E test (TEST-03)
  - Coach review workflow E2E test (TEST-05)
  - data-testid attributes on dashboard, course, lesson, and coach components
affects: [14-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [route-mocking-for-deterministic-tests, conditional-interaction-handling, api-call-tracking]

key-files:
  created:
    - e2e/tests/lesson.spec.ts
    - e2e/tests/coach.spec.ts
  modified:
    - src/app/(dashboard)/dashboard/page.tsx
    - src/app/(dashboard)/courses/[courseId]/page.tsx
    - src/app/(dashboard)/lessons/[lessonId]/page.tsx
    - src/components/course/CourseCard.tsx
    - src/components/course/LessonCard.tsx
    - src/components/coach/SubmissionQueue.tsx
    - src/components/coach/SubmissionCard.tsx
    - src/components/coach/CoachFeedbackForm.tsx
    - src/components/coach/CoachNotesPanel.tsx

key-decisions:
  - "Verify lesson completion via progress API call tracking rather than UI badge (lesson page has no server-rendered completion indicator)"
  - "LessonCard uses tri-state data-testid: lesson-card-locked, lesson-card-completed, lesson-card"
  - "Coach tests mock full API chain (submissions list, detail, feedback, notes) for isolated testing"
  - "Conditional interaction handling in lesson test (lessons may or may not have cue points)"

patterns-established:
  - "API call tracking: collect route handler calls to verify backend communication"
  - "Conditional UI testing: gracefully handle optional elements (interactions, locked lessons)"
  - "Full API mocking chain: mock list endpoints, detail endpoints, and mutation endpoints together"

# Metrics
duration: 8min
completed: 2026-01-30
---

# Phase 14 Plan 03: Student & Coach E2E Test Specs Summary

**Lesson completion test with video progress + interaction pass, and coach review test with feedback sending + notes creation, using mocked APIs and Page Object Models**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-30T08:22:53Z
- **Completed:** 2026-01-30T08:30:57Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Student lesson completion test covering dashboard navigation, video progress + interaction, and lock enforcement
- Coach review workflow test covering submission queue, feedback sending, and note creation
- Added data-testid attributes to 9 components across dashboard, course, lesson, and coach pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Student lesson completion test spec** - `c8a8811` (feat)
2. **Task 2: Coach review workflow test spec** - `cc056f1` (feat)

## Files Created/Modified
- `e2e/tests/lesson.spec.ts` - 3 tests: navigation, completion flow, lock enforcement
- `e2e/tests/coach.spec.ts` - 3 tests: queue visibility, feedback sending, notes creation
- `src/app/(dashboard)/dashboard/page.tsx` - Added data-testid="course-grid"
- `src/app/(dashboard)/courses/[courseId]/page.tsx` - Added data-testid="lessons-list"
- `src/app/(dashboard)/lessons/[lessonId]/page.tsx` - Added data-testid="video-player-area"
- `src/components/course/CourseCard.tsx` - Added data-testid="course-card"
- `src/components/course/LessonCard.tsx` - Added tri-state data-testid (locked/completed/card)
- `src/components/coach/SubmissionQueue.tsx` - Added data-testid="submission-queue"
- `src/components/coach/SubmissionCard.tsx` - Added data-testid="submission-card"
- `src/components/coach/CoachFeedbackForm.tsx` - Added data-testid for feedback-input, send-feedback, feedback-success
- `src/components/coach/CoachNotesPanel.tsx` - Added data-testid for note-input, add-note-button, note-item

## Decisions Made
- Lesson completion is verified by tracking progress API POST calls rather than looking for a completion badge (the lesson player page is a server component without a client-side completion indicator)
- LessonCard uses a tri-state testid pattern: `lesson-card-locked`, `lesson-card-completed`, or `lesson-card` to distinguish all possible lesson states
- Coach tests mock the complete API chain (list, detail, feedback, notes) for full isolation from database state
- Lesson interaction test is conditional -- if no cue points trigger an overlay, the test verifies progress API calls instead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added data-testid attributes to 9 components**
- **Found during:** Task 1 (lesson spec creation)
- **Issue:** No components had data-testid attributes, making reliable test selection impossible
- **Fix:** Added data-testid to CourseCard, LessonCard, DashboardPage, CourseDetailPage, LessonPage, SubmissionQueue, SubmissionCard, CoachFeedbackForm, and CoachNotesPanel
- **Files modified:** 9 component/page files
- **Verification:** Playwright --list shows all tests resolving correctly
- **Committed in:** c8a8811 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Adding data-testid attributes was necessary for any E2E test to work reliably. No scope creep.

## Issues Encountered
- LessonCard data-testid was reverted by linter twice to a simpler format; resolved by re-applying the tri-state pattern after each linter run
- Task 1 data-testid changes were auto-committed as part of a prior plan's commit (c8a8811); lesson.spec.ts was included in that commit

## User Setup Required
None - test specs use mocked APIs and do not require external service configuration.

## Next Phase Readiness
- 6 E2E test specs now exist covering enrollment, grading, Chinese IME, lesson completion, and coach review
- All tests use Page Object Models and mocked APIs for deterministic behavior
- Plan 04 can add audio/voice conversation tests to complete the test suite
- Actual test execution requires Clerk test credentials and a running dev server

---
*Phase: 14-e2e-testing*
*Completed: 2026-01-30*
