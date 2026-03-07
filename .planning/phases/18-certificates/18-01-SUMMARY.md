---
phase: 18-certificates
plan: 01
subsystem: database, pdf
tags: [react-pdf, nanoid, drizzle, certificates, cjk-fonts, pdf-generation]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users and courses schema, db connection
  - phase: 04-progress-system
    provides: lessonProgress table for completion checking
provides:
  - certificates database table with unique constraints
  - certificate CRUD library (create, lookup, list, completion check)
  - CertificateDocument PDF template with CJK font support
  - NotoSansSC and Inter variable fonts
affects: [18-02, 18-03, certificates API routes, certificate verification page]

# Tech tracking
tech-stack:
  added: ["@react-pdf/renderer", "nanoid"]
  patterns: ["Variable fonts for PDF rendering", "Idempotent certificate creation with ON CONFLICT DO NOTHING", "Snapshot pattern for student name and course title"]

key-files:
  created:
    - src/db/schema/certificates.ts
    - src/lib/certificates.ts
    - src/components/certificate/CertificateDocument.tsx
    - public/fonts/NotoSansSC-Regular.ttf
    - public/fonts/Inter-Regular.ttf
  modified:
    - src/db/schema/index.ts
    - package.json

key-decisions:
  - "Variable fonts instead of separate Regular/Bold files -- single file covers all weights"
  - "Snapshot student name and course title at certificate creation time"
  - "nanoid(12) for short URL-safe verification IDs"
  - "ON CONFLICT DO NOTHING for idempotent certificate creation"

patterns-established:
  - "Certificate snapshot pattern: freeze user/course data at issuance time"
  - "Font.register with variable fonts for @react-pdf/renderer CJK support"

# Metrics
duration: 8min
completed: 2026-01-30
---

# Phase 18 Plan 01: Certificate Schema, Library, and PDF Template Summary

**Certificates table with nanoid verification IDs, completion-checking library, and landscape A4 PDF template with NotoSansSC CJK font support**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-30T14:53:17Z
- **Completed:** 2026-01-30T15:01:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Certificate schema with userId+courseId unique constraint and verificationId unique column
- Four certificate helper functions: checkCourseCompletion, createCertificate, getCertificateByVerificationId, getCertificatesForUser
- Landscape A4 PDF template with decorative double border, Chinese character support via NotoSansSC variable font
- Idempotent certificate creation (ON CONFLICT DO NOTHING returns existing cert)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, download fonts, create certificate schema** - `a17ee76` (feat)
2. **Task 2: Certificate library and PDF template component** - `6891616` (feat)

## Files Created/Modified
- `src/db/schema/certificates.ts` - Certificate table with userId, courseId, verificationId, studentName, courseTitle, completedAt
- `src/db/schema/index.ts` - Added certificates barrel export
- `src/lib/certificates.ts` - CRUD helpers: checkCourseCompletion, createCertificate, getCertificateByVerificationId, getCertificatesForUser
- `src/components/certificate/CertificateDocument.tsx` - React-PDF landscape A4 template with Inter and NotoSansSC fonts
- `public/fonts/NotoSansSC-Regular.ttf` - Variable CJK font for Chinese character rendering
- `public/fonts/Inter-Regular.ttf` - Variable Latin font for certificate text
- `package.json` - Added @react-pdf/renderer and nanoid dependencies

## Decisions Made
- Used variable fonts (single file, multiple weights) instead of separate Regular/Bold files -- simpler management, same visual results
- Snapshot student name and course title at certificate creation time so name changes don't affect issued certificates
- Used nanoid(12) for verification IDs -- short, URL-safe, collision-resistant
- ON CONFLICT DO NOTHING for idempotent creation -- calling createCertificate multiple times returns existing cert
- Applied schema via direct SQL instead of drizzle-kit push (which hung on the Neon connection)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used variable fonts instead of separate Regular/Bold files**
- **Found during:** Task 1 (font download)
- **Issue:** Google Fonts GitHub repo provides variable fonts, not separate weight files. Initial download URLs for NotoSansSC returned HTML redirect pages.
- **Fix:** Downloaded variable font files from google/fonts main repo; registered same file with different fontWeight values in Font.register
- **Files modified:** public/fonts/, src/components/certificate/CertificateDocument.tsx
- **Verification:** Font files verified as TrueType with `file` command
- **Committed in:** a17ee76 (Task 1)

**2. [Rule 3 - Blocking] Applied schema via direct SQL instead of drizzle-kit push**
- **Found during:** Task 1 (schema migration)
- **Issue:** `npx drizzle-kit push` hung indefinitely pulling schema from Neon database
- **Fix:** Ran CREATE TABLE SQL directly via @neondatabase/serverless client
- **Verification:** Table created successfully, TypeScript compilation passes
- **Committed in:** a17ee76 (Task 1)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for task completion. No scope creep.

## Issues Encountered
- drizzle-kit push hangs on Neon websocket connection -- used direct SQL as workaround (consistent with project pattern from Phase 16)
- Google Fonts GitHub raw URLs for Noto CJK returned HTML redirect pages -- switched to correct raw.githubusercontent.com paths

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Certificate schema deployed to database
- Library functions ready for API route integration (Plan 02)
- PDF template ready for server-side rendering (Plan 03)
- All exports available from schema barrel and lib/certificates

---
*Phase: 18-certificates*
*Completed: 2026-01-30*
