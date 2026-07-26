# Engineering Pre-Work for the Migration

Backlog derived from a full audit of the codebase (July 2026). Tags: **[BLOCKER]** must ship before cutover · **[IMPORTANT]** ship before/during the migration window · **[LATER]** hardening, schedule after T+30.

## Blockers

### 1. [BLOCKER] Course JSON importer
The scraper (`scripts/ghl-scrape-course.ts`) produces normalized JSON per course and mirrors videos to Vercel Blob, but its docstring references an `/admin/course-library/import-from-ghl` page that **was never built** — the JSON has no consumer. Build the importer (admin page or a `tsx` script) that creates Course Library courses/modules/lessons from `scripts/scraped-ghl/{productId}.json`, wiring mirrored Blob video URLs.
Known content losses to surface in the import report, not silently absorb: quizzes arrive as empty shells (`passingScore: 70, questions: []`) and audio posts are flattened to text lessons (`mapPostToLesson`). The importer should emit a rebuild checklist (lesson → "quiz needs rebuilding" / "audio needs re-attaching") for ops.

### 2. [BLOCKER] Progress seeding
No mechanism exists to place a migrated student at "Section X, Lesson N" with prior modules complete. On a linear-progression platform this is the single most trust-critical migration feature. Needed: an admin bulk operation (CSV: email, section, lesson-number, m1/m2/m3 completion dates) that
- inserts completed `lesson_progress` rows for all lessons before the target (module-completion rows dated from the GHL M1/M2/M3 dates),
- leaves the target lesson unlocked and everything after locked,
- is idempotent and re-runnable per student (coaches will request corrections during the dispute window).

### 3. [BLOCKER] Migration reconciliation view
`active_students` (the GHL snapshot table) has **no join to `users`** — no FK, no email match, nothing (`src/db/schema/active-students.ts`, confirmed by repo-wide grep). Build a report (admin page or endpoint) joining `active_students.email ↔ users.email ↔ ghl_contacts` showing per student: imported? invited? invite expired? activated (first login)? GHL-linked? progress seeded? coach assigned? This drives the daily activation chase, the coach follow-up lists, and every go/no-go metric.

### 4. [BLOCKER] Replace the invitation email copy
The default invite email still describes the product as "a beta test version… we are inviting you to try it out for fun." It's **duplicated in two places**: hardcoded in `src/components/admin/AddUserQuickDialog.tsx:74-78` and defaulted (with localStorage override keys `cmb.invitation.subject.v2`/`body.v2`) in `src/components/admin/StudentInvitePanel.tsx:21-35`. Replace both with Template 2 from `comms-templates.md` and de-duplicate into one shared default.

### 5. [BLOCKER] Env + config for the invite path
`GHL_INVITATION_WEBHOOK_URL` and `NEXT_PUBLIC_GHL_BOOKING_URL` are read in code but missing from `.env.example` (`invitations/route.ts:197`, `book-a-call/page.tsx:4`). Document them; verify `RESEND_API_KEY` fallback works in production; confirm `ENROLLMENT_WEBHOOK_SECRET`, `CRON_SECRET`, Upstash Redis are real values (echo detection silently no-ops without Redis — `src/lib/ghl/echo-detection.ts:20-27`).

## Important (before/during window)

### 6. [IMPORTANT] Expiry warning + expiry cron
End-date enforcement is lazy — the lock only happens when the student next loads the dashboard (`src/app/(dashboard)/layout.tsx:100-116`); no cron expires or warns anyone. During migration, expiring students are the churn-risk wave. Add a daily cron: T-7/T-1 "your plan ends soon" notification + email, and proactive lock/status write at expiry so admin lists are accurate.

### 7. [IMPORTANT] Server-side onboarding-completion tracking
Walkthrough completion is localStorage-only (`ProductWalkthrough.tsx:74,166` — key `cmb.onboarding.walkthrough.done.v1.{clerkUserId}`), so "% of migrated students who finished onboarding" is unreportable and device switches re-trigger the 24-step forced tour. Persist a `users` column or event on completion/skip; surface in the reconciliation view.

### 8. [IMPORTANT] Coaching-context note import
Importer for per-student notes from the export: Loom links (112 rows), homework type (112), 1:1 coaching progress (36), learning goals. Destination: coach notes / student profile so coaches keep context on day one.

### 9. [IMPORTANT] "Wrong lesson?" student report link
One-click report on the course page during the migration window ("Not where you left off? Tell us") that opens a pre-filled message to the student's coach. Cheap insurance for the trust-critical placement feature; feeds the <5% misplacement metric.

### 10. [IMPORTANT] Retry cron cadence mismatch
`src/app/api/cron/ghl-webhooks/route.ts:3` says "every 10 minutes" but `vercel.json` schedules it **daily at 07:00** — with the `4^i × 60s` backoff, failed GHL webhook deliveries effectively retry once a day. During the migration window (invite sends + milestone floods), set it to `*/10 * * * *`.

### 11. [IMPORTANT] Inactive-cron pagination bug
`src/app/api/cron/ghl-inactive/route.ts:49` caps at 20 students per run with `LIMIT` applied **before** dedup and no cursor — beyond 20 inactive students, the same window is rescanned and later students are never evaluated. Post-migration the whole roster runs through this. Fix the pagination.

### 12. [IMPORTANT] Onboarding coverage for non-reader cohorts
The forced walkthrough only triggers on the AI Passage Reader; cohorts whose reader is curated (`hideImport`) get **no onboarding at all** (`ReaderClient.tsx:326`). Confirm every migrated segment (incl. Improve-Canto and non-1:1 students) actually receives a first-login tour, and that a tour step can't wedge if OpenAI/TTS hiccups (the tour blocks all off-target clicks; Skip is the only exit).

## Later (hardening, post-T+30)

- **[LATER] End-date dual-source reconciliation.** Portal lock uses Clerk `cmbCourseEndDate`; the Lab Assistant and coach card read the GHL custom field. They match at import time but nothing keeps them matched. Add a reconciliation check (or make one derive from the other) before the first post-migration extension is sold.
- **[LATER] Admin students list scalability.** Portal status lives only in Clerk metadata → N+1 `clerk.users.getUser()` per row and in-memory filtering after pagination (`admin/students/page.tsx:236-286`), so filtered counts are wrong. Mirror status into `users`.
- **[LATER] `users.email` has no unique constraint** (`users.ts:17`) while several paths do find-by-email-and-adopt — duplicate rows would make matching nondeterministic. Add the constraint after de-duping.
- **[LATER] Role downgrade inconsistency.** Webhook/layout sync never downgrades roles, but a CSV re-upload via invitations hard-sets role and can silently demote an admin (`invitations/route.ts:296-331`). Align the two.
- **[LATER] GHL `api_token` stored plaintext** despite the "encrypted at app layer" comment (`src/db/schema/ghl.ts:37`); inbound webhook auth is a non-timing-safe shared-secret compare, not HMAC (`webhooks/ghl/route.ts:98-104`).
- **[LATER] Hardcoded location ID** `JOdDwlRF2K16cnIYW9Er` in `admin/students/page.tsx:362`, `admin/students/ghl/[contactId]/page.tsx:48` (legacy URL format), and the scraper default — inconsistent with the multi-location model.
- **[LATER] Un-linkable contacts.** `unlinkContact` (`contacts.ts:253`) has no caller/UI; mislinked students can only be fixed in SQL. Add an admin unlink action.
- **[LATER] Outbound tag-sync failures invisible** — `syncTagToGhl` only `console.error`s; nothing lands in `sync_events`, so the admin sync log under-reports (`tag-sync.ts:59`).
- **[LATER] Repo hygiene / PII.** The raw student CSV (332 KB of PII) and `TEAM-CREDENTIALS.txt` are committed at repo root, plus four ~2.4 MB stray `*-player-script.js` files. Remove from the repo and scrub history once the migration no longer needs the rehearsal file.
- **[LATER] `active_students` schema debt.** Broken inferred types (`city`/`state`/`website`/`company_name` as double precision; date-ish columns as text sorting lexically), destructive `if_exists='replace'` reload in `import_contacts.py`. Fine for the migration window; replace with a proper sync or drop the table after T+90.
