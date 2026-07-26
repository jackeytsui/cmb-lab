# Data Mapping: GHL Export → CMB Lab

Source: GHL "Active students (not lifetime)" contact export (86 columns).
Reference sample: `Export_Contacts_Active students (not lifetime)_Feb_2026_1_19_PM.csv` (143 rows, Feb 2026 — **rehearsal data only; pull a fresh export at T-1**).

Join keys, in order:
1. **Email** (lowercased, trimmed) — present on 143/143. This is the key the platform already links on (`linkAndSyncTagsFromGhl`, invitations upsert).
2. **Contact Id** → `ghl_contacts.ghl_contact_id` once linked.

## 1. Identity & account

| GHL column | Destination | Rule |
|---|---|---|
| `Contact Id` | `ghl_contacts.ghl_contact_id` | Created automatically by the Clerk `user.created` webhook link, or manually via `POST /api/admin/ghl/contacts/link`. |
| `First Name` / `Last Name` | Invite CSV `first name` / `last name` → Clerk + `users` | Title-case. Watch for duplication artifacts (e.g. "Lillian ng brantley / Ng brantley") — fix in the exceptions sheet, not by script. |
| `Email` | Invite CSV `email address` (join key) | Lowercase. If `Additional Emails` present, ops picks the login email with the student before import. |
| `Phone`, `Additional Phones` | **Not imported.** | GHL stays CRM source of truth; visible in-app via the GHL profile card. |
| `Timezone` | `users.timezone` (present 142/143) | Also cached in `ghl_contacts.cached_data`. Note: end-date enforcement is UTC end-of-day regardless (see gaps doc). |
| `DND` | Invite **suppression list** | DND=true → no automated email; coach reaches out personally with the invite link. |

## 2. Entitlements

| GHL column | Destination | Rule |
|---|---|---|
| `Course Eligibility` (all "YES") | Course enrollment | Everyone gets the CMBP course grant (default Student role + `purchased-cmbp` tag content grants — confirm exact tag→content mapping in `/admin/tag-access` before import). |
| `Product line?` | Which course(s) | blank → CMBP (legacy default, 115 rows); `CMBP` → CMBP; `Improve Canto` → Cantonese Improvement course. |
| `1:1 Eligibility` + `1on1 Coach Name` | 1:1 feature tags + `users.assignedCoachId` | YES (110) → 1:1 tag set; NO (33) → ensure no 1:1-gated features leak (D4). |
| `Coach name` | `users.assignedCoachId` via bulk-assign (`POST /api/admin/students/bulk-assign-coach`) | Normalize: Jane / Tiffany / Janelle. 32 blanks → ops assignment pass (D3) **before** coach sign-off week. |
| `Access plan` | Plan label (tag) + informs end date sanity check | Normalization table below. |
| `Product Start Date` | Archive + analytics context | Not enforced in-app. |
| `Product END date` (+ courtesy extension per D2) | Invite CSV `course end date` → Clerk `cmbCourseEndDate` | This is what locks the portal after expiry. GHL field stays authoritative for the Lab Assistant / coach card — **keep both in sync at import time** (they'll match because both come from the same export + extension). |
| `1 on 1 End Date` | GHL (unchanged) | Read live by coach tooling via GHL; no import needed. |
| `Payment Status`, `Paid total` | **Not imported** | Finance stays in GHL/Stripe. Archive only. |
| `CMS trial start/end date` | **Not imported** | Trial-era artifact. |

### Access plan normalization

| Raw value (count in sample) | Normalized |
|---|---|
| `6 months` (124), `6 Months` (3) | `plan:6mo` |
| `7 months extension` (3) | `plan:6mo+ext` |
| `4 months extension` (1) | `plan:6mo+ext` |
| `Paid add-on monthly` (9) | `plan:monthly-addon` |
| `1 year` (1), `12 months` (1) | `plan:12mo` |
| blank (1) | **REVIEW** — ops resolves manually; import blocks on unresolved REVIEW rows |

Any value not in this table → REVIEW. Never guess.

## 3. Progress (trust-critical)

CMB Lab enforces linear progression, so seeding must produce: prior modules **completed** (with original dates), current lesson **unlocked**, everything after **locked**.

| GHL column | Destination | Rule |
|---|---|---|
| `CMBP Level (Which Section is Student On?)` | Starting module | `Foundations` / `Intermediate` / `Advanced` / `Finished_CMBP_Course` / `Cantonese_Improvement_Course`. Blank (48 rows) → derive from module-completion dates or tags (`on_foundations`, `completed-foundations`); still blank → Foundations start + flag for coach. |
| `Which Lesson Number is the Student At?` | Starting lesson within section | **The number is relative to the section**, values 1–13 (one outlier: 22 → REVIEW). Resolve via `(section, n) → lessonId` against the imported course structure. Missing (58 rows) → first incomplete lesson of their section. |
| `M1/M2/M3 - Completion Date` | Seed completed `lesson_progress` for those modules, dated | Keeps analytics and certificates honest. M1: 61, M2: 35, M3: 12 in sample. |
| Tags `completed-foundations`, `on_*` | Cross-check | Conflict with the columns above → row goes on the coach-verification list, not auto-resolved. |

## 4. Coaching context

| GHL column | Destination |
|---|---|
| `Loom link` (112), `Welcome loom` (9) | Coach note on the student profile (links preserved verbatim). |
| `homework_type` (112) | Coach note; informs first CMB Lab assignment. |
| `1on1 coaching progress` (36), `1on1 coaching fathom link` | Coach note / coaching-material session seed. |
| `Why they wanna learn Chinese - what's their main goal?` | Student profile note — surfaces in coach view and gives the Lab Assistant/coach context. |
| `General notes` (2) | Coach note. |

## 5. Tags

Inbound tag sync only applies tags that already exist in CMB Lab (CMB is the master list — `processInboundTagUpdate` skips unknown tags). So **pre-create** the tags we want to carry, then linking auto-applies them:

**Carry over:** `paid_students`, `purchased-cmbp`, `standard_package`, `on_foundations`, `completed-foundations`, `on_improve_cantonese` (+ any tag wired to entitlements in `/admin/tag-access`).

**Do not carry** (stay GHL-only): funnel/lead history (`lead_*`, `booking-*`, `youtube-lead`, `vapi`, `click-to-calender*`), engagement scoring (`10-day-engager`, `emails-opened`), and plumbing (`temporary_zapier_webhook_general` — but inventory the Zapier hooks behind it before cutover).

## 6. Explicitly not migrated

Survey template artifacts (`How would you rate the cleanliness of the work site…` etc. — GHL template leftovers), `Opportunities`, `Workflows Active/Finished`, support-ticket fields, `Sales Rep`, `Followers`, address/business fields. All preserved in the archived export.

## 7. Archive manifest (kept ≥ 1 year)

1. Final full GHL contact export (all columns, all contacts — not just actives).
2. Scraped course JSON per product (`scripts/scraped-ghl/*.json`) + video manifests (`*.videos.json`).
3. Mirrored videos in Vercel Blob (`course-library/video/ghl-migration/…`).
4. Screenshot/export of GHL automation + workflow inventory at freeze time.
5. The normalization exceptions sheet and coach sign-off sheets.
