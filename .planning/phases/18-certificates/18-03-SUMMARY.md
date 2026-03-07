---
phase: 18-certificates
plan: 03
subsystem: ui
tags: [react, certificate, dashboard, pdf-download, client-component]

# Dependency graph
requires:
  - phase: 18-certificates-01
    provides: Certificate schema, CRUD library, PDF template
  - phase: 18-certificates-02
    provides: Certificate generate and download API routes
  - phase: 05-student-dashboard
    provides: Dashboard page with CourseCard component
provides:
  - CertificateDownloadButton client component
  - Dashboard certificate query and prop passing
  - CourseCard completion detection and download button rendering
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Certificate download via stopPropagation in nested Link components"
    - "Server-side certificate map lookup for prop hydration"

key-files:
  created:
    - src/components/certificate/CertificateDownloadButton.tsx
  modified:
    - src/app/(dashboard)/dashboard/page.tsx
    - src/components/course/CourseCard.tsx

key-decisions:
  - "CertificateDownloadButton uses stopPropagation to prevent Link navigation"
  - "Dashboard queries certificates table separately and builds courseId->verificationId map"
  - "Course completion check: totalLessons > 0 && completedLessons === totalLessons"

patterns-established:
  - "Nested interactive elements in Link: use stopPropagation + preventDefault"

# Metrics
duration: 6min
completed: 2026-01-30
---

# Phase 18 Plan 03: Certificate Dashboard Integration Summary

**CertificateDownloadButton wired into CourseCard with completion detection and dashboard certificate query**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-30T16:08:06Z
- **Completed:** 2026-01-30T16:13:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- CertificateDownloadButton client component with loading state and error handling
- Dashboard queries certificates table and passes verificationId to CourseCard
- CourseCard renders download button only when all lessons completed
- Button click generates certificate (idempotent) then opens PDF download in new tab

## Task Commits

Each task was committed atomically:

1. **Task 1: CertificateDownloadButton client component** - `41dc1a9` (feat)
2. **Task 2: Wire certificate download into dashboard and CourseCard** - `f39fcdd` (feat)

## Files Created/Modified
- `src/components/certificate/CertificateDownloadButton.tsx` - Client component: generates certificate on click, downloads PDF via new tab
- `src/app/(dashboard)/dashboard/page.tsx` - Added certificates query and certificateVerificationId prop to CourseCard
- `src/components/course/CourseCard.tsx` - Added completion check and CertificateDownloadButton rendering

## Decisions Made
- CertificateDownloadButton uses both `preventDefault()` and `stopPropagation()` to prevent the parent Link from navigating when clicking the download button
- Dashboard queries the certificates table separately (not joined into the main query) to keep the existing complex query unchanged
- Course completion check uses exact equality: `totalLessons > 0 && completedLessons === totalLessons`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type errors in certificate download route**
- **Found during:** Task 1 (pre-existing from 18-01)
- **Issue:** `Buffer` not assignable to `BodyInit` and `Date` type mismatch in `renderToBuffer` call
- **Fix:** Converted `Buffer` to `Uint8Array`, wrapped `completedAt` in `new Date()`, used type assertion for `renderToBuffer`
- **Files modified:** `src/app/api/certificates/[certificateId]/download/route.ts`
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** Already applied by linter during 18-02 execution

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Pre-existing type error from 18-01 was already resolved. No scope creep.

## Issues Encountered
- Build fails due to missing Clerk `publishableKey` environment variable (expected in dev environments without `.env.local` fully configured). TypeScript compilation and type checking both pass cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Certificate system is fully integrated: schema, library, API routes, PDF template, and dashboard UI
- Phase 18 complete -- all 3 plans delivered
- Ready for next milestone phases

---
*Phase: 18-certificates*
*Completed: 2026-01-30*
