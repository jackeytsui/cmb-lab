---
phase: 18-certificates
plan: 02
subsystem: api
tags: [certificates, pdf, react-pdf, linkedin, verification, middleware]

# Dependency graph
requires:
  - phase: 18-certificates-01
    provides: certificate schema, CRUD library, PDF template component
provides:
  - POST /api/certificates/generate endpoint
  - GET /api/certificates/[id]/download PDF endpoint
  - Public /verify/[id] verification page with LinkedIn share
  - Middleware updated for public certificate routes
affects: [18-certificates-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Public verification page without auth (middleware exclusion)
    - LinkedIn Add to Profile URL integration
    - Server-side PDF rendering via renderToBuffer in API route

key-files:
  created:
    - src/app/api/certificates/generate/route.ts
    - src/app/api/certificates/[certificateId]/download/route.ts
    - src/app/verify/[certificateId]/page.tsx
  modified:
    - middleware.ts

key-decisions:
  - "Type assertion (any) for renderToBuffer to bridge CertificateDocument props and DocumentProps types"
  - "Certificate download route also public (no auth) -- anyone with verification ID can download"
  - "LinkedIn Add to Profile URL scheme with CERTIFICATION_NAME startTask"

patterns-established:
  - "Public route pattern: add to isPublicRoute matcher in middleware.ts"
  - "PDF download: renderToBuffer + new Response(Uint8Array) with Content-Disposition header"

# Metrics
duration: 4min
completed: 2026-01-30
---

# Phase 18 Plan 02: Certificate API Routes and Verification Page Summary

**Certificate generation/download API routes and public verification page with LinkedIn sharing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-30T16:07:56Z
- **Completed:** 2026-01-30T16:11:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- POST endpoint creates certificate record for authenticated users who completed a course
- GET endpoint renders and downloads certificate as PDF with proper Content-Type/Disposition headers
- Public verification page shows certificate details, download button, and LinkedIn share
- Middleware updated to allow unauthenticated access to /verify and certificate download routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Certificate generation and download API routes** - `210b434` (feat)
2. **Task 2: Public verification page and middleware update** - `fbac930` (feat)

## Files Created/Modified
- `src/app/api/certificates/generate/route.ts` - POST endpoint to create certificate on course completion
- `src/app/api/certificates/[certificateId]/download/route.ts` - GET endpoint to render/download PDF
- `src/app/verify/[certificateId]/page.tsx` - Public verification page with LinkedIn share
- `middleware.ts` - Added /verify and certificate download to public routes

## Decisions Made
- Used type assertion (`any`) for `renderToBuffer` call to bridge React component props with `@react-pdf/renderer` DocumentProps type constraint
- Made certificate download route public (no auth) -- anyone with the verification ID can download the PDF
- Added both `/verify(.*)` and `/api/certificates/(.*)/download` to middleware public routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in download route**
- **Found during:** Task 1 (API routes)
- **Issue:** `React.createElement(CertificateDocument, ...)` produced type incompatible with `renderToBuffer` (expects `ReactElement<DocumentProps>`); `Buffer` type not assignable to `Response` body
- **Fix:** Applied `any` type assertion on createElement result; wrapped buffer in `new Uint8Array()` for Response compatibility
- **Files modified:** `src/app/api/certificates/[certificateId]/download/route.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `210b434` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type assertion necessary due to @react-pdf/renderer generics. No scope creep.

## Issues Encountered
None beyond the type error fixed above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Certificate generation, download, and verification workflow complete
- Ready for Plan 03 (integration with student dashboard / course completion triggers)
- NEXT_PUBLIC_APP_URL env var should be set for correct LinkedIn share URLs in production

---
*Phase: 18-certificates*
*Completed: 2026-01-30*
