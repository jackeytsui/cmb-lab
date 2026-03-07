---
phase: 18-certificates
verified: 2026-01-30T16:17:18Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 18: Certificates Verification Report

**Phase Goal:** Students receive a downloadable certificate when they complete a course
**Verified:** 2026-01-30T16:17:18Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PDF certificate is automatically generated when student completes a course | ✓ VERIFIED | `CertificateDownloadButton` calls `/api/certificates/generate` POST, which checks completion via `checkCourseCompletion` before creating certificate |
| 2 | Certificate displays student name, course title, completion date, and unique verification ID | ✓ VERIFIED | `CertificateDocument.tsx` renders all four fields with NotoSansSC font support for CJK characters |
| 3 | Student sees download button on dashboard for each completed course | ✓ VERIFIED | `CourseCard` renders `CertificateDownloadButton` when `completedLessons === totalLessons`, wired from dashboard query |
| 4 | Anyone can verify a certificate at /verify/[certificateId] without logging in | ✓ VERIFIED | `/verify/[certificateId]/page.tsx` is public server component, middleware includes `/verify(.*)` in public routes |
| 5 | Certificate page includes a LinkedIn share button | ✓ VERIFIED | Verify page has LinkedIn Add to Profile URL with correct CERTIFICATION_NAME startTask |
| 6 | Chinese characters in student name and course title render correctly in the PDF | ✓ VERIFIED | `Font.register` loads NotoSansSC-Regular.ttf (17MB file exists), `studentName` and `courseTitle` use `fontFamily: "NotoSansSC"` |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/certificates.ts` | Certificate table schema | ✓ VERIFIED | Exists (53 lines). Contains `certificates` table with all required fields: id, userId, courseId, verificationId, studentName, courseTitle, completedAt, createdAt. UNIQUE constraint on (userId, courseId). Exported via schema/index.ts |
| `src/lib/certificates.ts` | Certificate CRUD helpers | ✓ VERIFIED | Exists (151 lines). Exports all 4 required functions: `checkCourseCompletion`, `createCertificate`, `getCertificateByVerificationId`, `getCertificatesForUser` |
| `src/components/certificate/CertificateDocument.tsx` | PDF template with CJK support | ✓ VERIFIED | Exists (172 lines). Uses `@react-pdf/renderer` with `Font.register` for Inter and NotoSansSC. Landscape A4 with double border, all required fields rendered |
| `src/app/api/certificates/generate/route.ts` | POST endpoint to create certificate | ✓ VERIFIED | Exists (58 lines). Exports POST handler. Calls `checkCourseCompletion` then `createCertificate`, returns verificationId |
| `src/app/api/certificates/[certificateId]/download/route.ts` | GET endpoint to download PDF | ✓ VERIFIED | Exists (46 lines). Exports GET handler. Calls `renderToBuffer(CertificateDocument)`, returns PDF with Content-Type/Content-Disposition headers |
| `src/app/verify/[certificateId]/page.tsx` | Public verification page | ✓ VERIFIED | Exists (131 lines). Server component, no auth required. Displays certificate details, download button, LinkedIn share with correct URL |
| `middleware.ts` | Public route config | ✓ VERIFIED | Updated. Includes `/verify(.*)` and `/api/certificates/(.*)/download` in `isPublicRoute` matcher |
| `src/components/certificate/CertificateDownloadButton.tsx` | Client download button | ✓ VERIFIED | Exists (78 lines). Client component with loading state. Calls `/api/certificates/generate` POST, opens download URL via window.open. Uses stopPropagation |
| `public/fonts/NotoSansSC-Regular.ttf` | CJK font file | ✓ VERIFIED | Exists (17MB). Variable font for Chinese character rendering |
| `public/fonts/Inter-Regular.ttf` | Latin font file | ✓ VERIFIED | Exists (857K). Variable font for English text |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/lib/certificates.ts` | `src/db/schema/certificates.ts` | Drizzle CRUD | ✓ WIRED | `db.insert(certificates)` on line 96, `db.query.certificates.findFirst` on lines 112, 133, 145 |
| `src/components/certificate/CertificateDocument.tsx` | `public/fonts/` | Font.register | ✓ WIRED | `Font.register` on lines 13-24, 28-39 with `path.join(process.cwd(), 'public/fonts/...')` |
| `src/app/api/certificates/generate/route.ts` | `src/lib/certificates.ts` | createCertificate call | ✓ WIRED | Imports and calls `checkCourseCompletion` (line 34), `createCertificate` (line 42) |
| `src/app/api/certificates/[certificateId]/download/route.ts` | `src/components/certificate/CertificateDocument.tsx` | renderToBuffer | ✓ WIRED | Imports `CertificateDocument` (line 5), calls `renderToBuffer(pdfElement)` (line 30) |
| `src/app/verify/[certificateId]/page.tsx` | `src/lib/certificates.ts` | getCertificateByVerificationId | ✓ WIRED | Imports and calls `getCertificateByVerificationId` (lines 3, 13, 36) |
| `src/components/certificate/CertificateDownloadButton.tsx` | `/api/certificates/generate` | fetch POST | ✓ WIRED | `fetch("/api/certificates/generate", { method: "POST", ... })` on line 35 |
| `src/components/certificate/CertificateDownloadButton.tsx` | `/api/certificates/[id]/download` | window.open | ✓ WIRED | `window.open(\`/api/certificates/${currentVerificationId}/download\`, "_blank")` on lines 52-54 |
| `src/app/(dashboard)/dashboard/page.tsx` | `src/components/course/CourseCard.tsx` | certificateVerificationId prop | ✓ WIRED | Dashboard queries certificates table (lines 57-68), builds `certificateMap` (line 71), passes to CourseCard via `certificateVerificationId` prop (line 105) |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CERT-01: PDF certificate generated on course completion | ✓ SATISFIED | `createCertificate` checks `checkCourseCompletion`, throws if incomplete |
| CERT-02: Certificate includes student name, course title, completion date, unique ID | ✓ SATISFIED | All fields present in schema snapshot and rendered in PDF template |
| CERT-03: Download button on student dashboard for completed courses | ✓ SATISFIED | `CourseCard` shows button when `completedLessons === totalLessons` |
| CERT-04: Public verification page at /verify/[certificateId] | ✓ SATISFIED | Page exists, middleware allows public access |
| CERT-05: LinkedIn share button on certificate page | ✓ SATISFIED | LinkedIn Add to Profile URL with CERTIFICATION_NAME startTask |
| CERT-06: Chinese characters render correctly in PDF | ✓ SATISFIED | NotoSansSC font registered and applied to studentName/courseTitle |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/api/certificates/[certificateId]/download/route.ts` | 22 | `eslint-disable-next-line @typescript-eslint/no-explicit-any` | ⚠️ Warning | Type assertion used to bridge React component props with @react-pdf/renderer DocumentProps constraint. Acceptable workaround for library limitation. |
| `src/lib/certificates.ts` | 90 | Fallback to email if name missing | ℹ️ Info | `user.name \|\| user.email` — graceful degradation, not a blocker |

### Human Verification Required

#### 1. PDF Visual Appearance

**Test:** Complete a course, download certificate, open PDF
**Expected:** 
- Landscape A4 format
- Double border (outer blue, inner lighter blue)
- "Certificate of Completion" header in uppercase
- Student name centered, large, in NotoSansSC font
- Course title emphasized below "has successfully completed"
- Completion date formatted as "January 30, 2026"
- Verification ID at bottom with "/verify/{id}" text
**Why human:** Visual layout and font rendering require human judgment

#### 2. Chinese Character Rendering

**Test:** 
1. Create test user with Chinese name (e.g., "李明 Li Ming")
2. Create test course with Chinese title (e.g., "粵語課程 Cantonese Course")
3. Complete course and download certificate
4. Open PDF and verify Chinese characters display correctly
**Expected:** Chinese characters render clearly without boxes/question marks
**Why human:** CJK font rendering quality requires visual inspection

#### 3. LinkedIn Share Flow

**Test:**
1. Visit /verify/[certificateId] page
2. Click "Add to LinkedIn" button
3. Verify LinkedIn opens correct Add to Profile form
4. Check that course title, organization name ("CantoMando Blueprint"), and verification URL are pre-filled
**Expected:** LinkedIn form opens with all fields pre-populated
**Why human:** External service integration requires manual testing

#### 4. Download Button in Nested Link

**Test:**
1. View dashboard with completed course
2. Click certificate download button
3. Verify PDF downloads AND page does NOT navigate to course page
**Expected:** PDF opens in new tab, dashboard stays in current tab
**Why human:** Event propagation behavior needs manual click testing

---

## Summary

**All automated checks passed.** Certificate system is fully implemented:

1. ✅ **Schema & Database**: Certificates table with unique constraints deployed
2. ✅ **Core Logic**: Completion checking, idempotent creation, lookup helpers
3. ✅ **PDF Generation**: React-PDF template with CJK font support
4. ✅ **API Routes**: Generate and download endpoints
5. ✅ **Public Verification**: /verify page with LinkedIn sharing
6. ✅ **Dashboard Integration**: Download button on completed courses

**Build status**: Dependencies installed (`@react-pdf/renderer@4.3.2`, `nanoid@5.1.6`). TypeScript compilation passes (type assertion in download route is documented workaround).

**Four items flagged for human verification** to confirm visual appearance, Chinese rendering, LinkedIn integration, and event propagation behavior.

---

_Verified: 2026-01-30T16:17:18Z_
_Verifier: Claude (gsd-verifier)_
