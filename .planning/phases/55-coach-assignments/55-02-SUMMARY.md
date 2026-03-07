---
phase: 55-coach-assignments
plan: 02
subsystem: ui, api, database
tags: [nextjs, drizzle, youtube, assignments, dashboard, progress]

# Dependency graph
requires:
  - phase: 55-coach-assignments
    provides: videoAssignments table, CRUD library, coach management page
  - phase: 50-video-schema
    provides: videoSessions table with completionPercent, totalWatchedMs
  - phase: 46-practice-assignments
    provides: 5-path target resolution pattern, assignment UI patterns
provides:
  - Student video assignment resolution query (getStudentVideoAssignments)
  - Coach per-student progress query (getVideoAssignmentProgress)
  - Student dashboard video assignments section with assigned video cards
  - Coach progress detail page with student-level completion table
  - Clickable assignment rows linking to progress detail
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [LEFT JOIN videoSessions for progress data, resolveTargetStudents helper for reverse-resolution]

key-files:
  created:
    - src/components/video/AssignedVideoCard.tsx
    - src/app/(dashboard)/coach/video-assignments/[assignmentId]/page.tsx
    - src/components/coach/VideoAssignmentProgress.tsx
  modified:
    - src/lib/video-assignments.ts
    - src/app/(dashboard)/dashboard/page.tsx
    - src/app/(dashboard)/coach/video-assignments/VideoAssignmentsClient.tsx

key-decisions:
  - "LEFT JOIN videoSessions (not INNER JOIN) to show unwatched students as 0% / Not started"
  - "Deduplicate by youtubeVideoId (not assignmentId) using TARGET_TYPE_PRIORITY map"
  - "resolveTargetStudents traverses lesson->module->course for enrollment resolution"

patterns-established:
  - "Video assignment progress from videoSessions LEFT JOIN pattern"
  - "Coach progress detail page with summary bar + sortable student table"

# Metrics
duration: 4m 33s
completed: 2026-02-09
---

# Phase 55 Plan 02: Student Video Assignments Dashboard and Coach Progress View Summary

**Student-facing assigned video cards on dashboard with Listening Lab links, plus coach per-student progress table with completion %, watch time, and status badges**

## Performance

- **Duration:** 4m 33s
- **Started:** 2026-02-09T10:13:45Z
- **Completed:** 2026-02-09T10:18:18Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- getStudentVideoAssignments resolves video assignments through all 5 target paths (student, tag, course, module, lesson) with LEFT JOIN progress from videoSessions
- getVideoAssignmentProgress resolves all target students for an assignment and returns per-student watch progress with completion %, time watched, last activity
- Student dashboard shows "Video Assignments" section with pending assigned video cards linking to Listening Lab
- Coach can drill into any assignment to see per-student progress sorted by completion status
- Coach assignment list rows now clickable with progress icon linking to detail page

## Task Commits

Each task was committed atomically:

1. **Task 1: Student resolution query + coach progress query** - `c9dc6fa` (feat)
2. **Task 2: Student dashboard integration + coach progress view page** - `9bb6d68` (feat)

## Files Created/Modified
- `src/lib/video-assignments.ts` - Added getStudentVideoAssignments, getVideoAssignmentProgress, resolveTargetStudents, interfaces, COMPLETION_THRESHOLD
- `src/components/video/AssignedVideoCard.tsx` - Client component with thumbnail, progress bar, due date badge, Listening Lab link
- `src/app/(dashboard)/dashboard/page.tsx` - Added video assignments section after practice assignments
- `src/app/(dashboard)/coach/video-assignments/[assignmentId]/page.tsx` - Server component for coach progress detail
- `src/components/coach/VideoAssignmentProgress.tsx` - Summary bar + sorted student progress table
- `src/app/(dashboard)/coach/video-assignments/VideoAssignmentsClient.tsx` - Added clickable links to progress detail page

## Decisions Made
- LEFT JOIN videoSessions (not INNER JOIN) ensures unwatched students appear as 0% / "Not started" rather than being excluded
- Deduplicate by youtubeVideoId (not assignmentId) to avoid showing duplicate video cards from overlapping targets
- resolveTargetStudents traverses lesson -> module -> course hierarchy for enrollment-based student resolution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 55 complete: video assignments fully functional from coach creation through student visibility and progress monitoring
- Schema migration needed when DATABASE_URL available (videoAssignments table from Plan 01)

## Self-Check: PASSED

All 6 files verified on disk. Both task commits (c9dc6fa, 9bb6d68) found in git log. Key exports (getStudentVideoAssignments, getVideoAssignmentProgress) confirmed. Dashboard contains "Video Assignments" section. AssignedVideoCard links to /dashboard/listening?videoId=. Coach progress page calls getVideoAssignmentProgress directly.

---
*Phase: 55-coach-assignments*
*Completed: 2026-02-09*
