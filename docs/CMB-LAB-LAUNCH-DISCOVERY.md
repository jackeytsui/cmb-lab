# CMB Lab production launch discovery

Discovery date: 2026-08-20 (America/Toronto)

QA update: 2026-08-21 (America/Toronto)

This report records verified facts separately from assumptions. No production
accounts, entitlements, GHL records, campaigns, or deployments were changed.

## Product QA release gate (2026-08-21)

- Production route sweep covered 21 admin and 23 learner routes, including a
  350 px viewport pass. No page errors or horizontal overflow were observed.
- The codebase now passes 24 unit-test files / 236 tests, quiet ESLint, TypeScript
  through the production build, a 90-file / 725-statement migration dry run,
  and `git diff --check`. Next.js generated all 202 static pages successfully.
- Access and integrity fixes cover preview lesson deep links, practice attempts,
  assignments and reviewer scopes, video threads, coaching ownership, chats,
  vocabulary, private student recordings, podcast visibility, media proxies,
  enrollment role preservation, and webhook authentication.
- Student recordings are now stored as private Blob objects and served through
  owner/staff-authorized range proxies. New coach-review submissions no longer
  receive a fabricated 80/100 automated score.
- Public and private podcast endpoints now bind each lesson to its published
  series and visibility rules; private tokens are rechecked against current
  user access.

The code is locally release-clean, but production is not yet launch-ready:

1. Rotate the OpenAI credential that appeared in production logs, then correct
   the malformed environment value. The credential itself is intentionally not
   recorded here.
2. Make the repository private and purge the tracked student CSV and
   `TEAM-CREDENTIALS.txt` from Git history; rotate any credentials that file ever
   contained.
3. Apply migrations `0084_repair_prompt_lab.sql` and
   `0085_private_student_media.sql` before deploying this build.
4. Confirm production Upstash credentials. Local builds intentionally fall back
   to a mock because those credentials are absent locally.
5. Finish the QA course at
   `/admin/course-library/251e18b7-caad-48b0-8dcd-7446203b012a`: it remains in
   Preview with a blank summary.
6. Deploy through an authenticated Vercel session, then repeat the admin/learner
   smoke test against the new deployment. No deployment was authorized or made
   during this QA pass.

## Immediate blockers

1. The GitHub repository `jackeytsui/cmb-lab` is public.
2. The active-student CSV and `TEAM-CREDENTIALS.txt` are tracked by Git. The CSV
   contains student PII. New ignore rules now prevent similarly named files and
   generated reports from being added accidentally, but ignore rules do not
   remove already tracked files or their Git history.
3. The checked-in credential file contains placeholders, so it cannot be used
   for live database or GHL discovery. The GHL API returned `401 Invalid JWT`.
4. Stable production course IDs and GHL custom-field IDs are therefore not yet
   verified. Product entitlements must remain undecided until that inspection.
5. The CSV uses `Improve Canto`; the approved system value is `Improve Kanto`.
   Do not map these automatically without a verified GHL value/business decision.

Required owner actions: make the repository private, remove the CSV and
credential file from the current tree and Git history, rotate any credential
that was ever real, and provide least-privilege read-only production access.

## Verified architecture

- Next.js 16 App Router / React 19 / TypeScript.
- Neon Postgres through Drizzle ORM.
- Clerk authentication. The UI and invitation code use email-based Clerk flows;
  the exact production one-time-code configuration still requires Clerk-console
  verification.
- Vercel project `new-lms-main`, linked to this repository. The latest verified
  production deployment was READY and the production domain is
  `cmb-lab.thecmblueprint.com`.
- Vercel runs daily GHL-related cron routes at 07:00 and 08:00 UTC. These routes
  currently process queued outbound webhooks and inactivity signals, not a full
  eligibility reconciliation.
- GHL models already exist for locations, contact links, configurable field
  mappings, sync events, cached contact data, and timestamps.
- Existing inbound GHL handling is primarily tag-update synchronization. It
  checks a shared secret and rate limits requests, but logs the complete inbound
  body and has no demonstrated GHL signature verification, event ordering, or
  idempotency in this route.
- A separate enrollment webhook is idempotent and can find/create Clerk users,
  create a database user, grant a legacy course, and assign a role.
- Email normalization exists in some paths (trim/lowercase in invitations and
  Clerk webhook matching), but it is not a single enforced shared invariant.
- Database migration `0026_unique_active_user_email.sql` adds a case-insensitive
  unique index for non-deleted users.
- Portal status is stored in Clerk public metadata as active/paused/expired.
  Pausing locks the Clerk user and preserves database records and assignments.
  Reactivation unlocks the user.
- Expiration currently uses `YYYY-MM-DDT23:59:59.999Z`, which implies an inclusive
  UTC end date. This is implementation behavior, not a verified business rule.
- There are three overlapping course/access systems: legacy courses plus
  `course_access`, role-based course permissions, and Course Library visibility
  through tags or per-course `allowed_user_ids`. Audio courses also reuse the
  legacy course model. A launch entitlement calculator does not yet unify them.
- Bulk portal status and invitation APIs exist and are admin-only, but they lack
  a mandatory dry-run, durable before/after audit records, and rollback workflow.
- The invitation API can send through a configured GHL webhook, but can fall
  back to Resend. Launch communications must use a GHL-only path with a durable
  send-once marker.

## CSV validation (aggregate only)

- Rows: 143 (below the expected approximately 185-200).
- Missing, malformed, or duplicate normalized emails: 0.
- Course Eligibility values: `YES` only.
- 1:1 Eligibility values: `YES`, `NO`.
- Product values: `CMBP`, `Improve Canto`.
- Missing Product Start Date: 3; invalid populated values: 0.
- Missing Product END date: 3; invalid populated values: 0.
- Missing 1 on 1 End Date: 110; invalid populated values: 0.
- The CSV contains a `1:1 Eligibility` column and no `101 eligibility` column.
  Whether live GHL also has a separate 101 field remains unverified.

The CSV is an initial reconciliation source only. Each row must be refreshed
against current GHL eligibility before provisioning.

## Course inventory and approval matrix

The schema proves the course types below, but the live catalogue and stable IDs
are not available without database/admin read access. These rows intentionally
remain undecided.

| Course system | Stable course ID | Course type | CMBP | Improve Kanto | 1:1 requirement | Date restriction | Existing examples | Recommended rule | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legacy `courses` | Unverified | Video/audio course | Undecided | Undecided | Undecided | Undecided | Unverified | Inventory live rows and existing grants first | Blocked |
| Course Library | Unverified | Library course | Undecided | Undecided | Undecided | Undecided | Unverified | Preserve tag/manual grants; add product rules separately | Blocked |
| Role-based courses | Unverified | RBAC course permission | Undecided | Undecided | Undecided | Undecided | Unverified | Reconcile with product entitlements before changing | Blocked |

## Fastest safe path to August 31

1. Today: contain the public-repository data exposure, rotate credentials, and
   restore least-privilege read access to Neon, Clerk, and GHL.
2. Next: export live course IDs, current assignments, GHL custom fields and stored
   values; resolve `Improve Canto` versus `Improve Kanto`; approve the compact
   matrix and the end-date timezone/boundary.
3. Implement one shared normalization/matching module, entitlement configuration,
   dry-run reconciliation, audit/manual-review tables, authenticated idempotent
   sync processing, and GHL-only launch send markers.
4. Add unit/integration tests for matching, dates, pausing/reactivation,
   assignment preservation, webhook replay/order, provisioning reruns, and
   send-once behavior. Repair CI secrets: recent E2E runs fail because the Clerk
   publishable key is missing at web-server startup.
5. Run dry-run against current GHL and production snapshots. Resolve all blockers.
6. Obtain approvals for the access matrix, product-rule application, bulk pause,
   provisioning, and campaign trigger.
7. Snapshot, provision, reconcile twice, segment recipients in GHL, send once,
   then monitor sync failures, login delivery, duplicate rates, and paused access.

## Draft GHL launch messages

Existing users:

Subject: Your updated CMB Lab access

Hello {{contact.first_name}},

CMB Lab has been updated. Continue signing in with your existing email address.
We will send a one-time login code to that inbox. Additional content may now be
available based on your eligibility. You do not need to create another account.

New users:

Subject: Your CMB Lab access is ready

Hello {{contact.first_name}},

Your CMB Lab access is ready. Visit the approved CMB Lab login URL and use the
same email address registered in GHL. We will send a one-time login code to your
inbox. Contact the approved support address if you need help.

The exact GHL merge-field syntax, login URL, and support contact must be verified
before these drafts are placed in a production workflow.
