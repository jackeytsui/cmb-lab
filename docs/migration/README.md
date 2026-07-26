# GHL → CMB Lab Student Migration Playbook

**Goal:** move every active student's course + assignment experience out of the GoHighLevel (GHL) membership portal and entirely into CMB Lab — with zero lost progress, zero lost access time, and a first-login experience that feels like an upgrade, not a chore.

**Scope decision (recommended):** GHL is *not* deleted. It remains the CRM for contacts, marketing funnels, and lead-gen — exactly the split already designed in `PRE-LAUNCH.md` and built into the codebase (contact linking, bidirectional tag sync, milestone webhooks, Lab Assistant end-date reads). What gets retired is the **GHL membership/course portal**: after cutover, students never log into GHL again. This keeps all existing integrations working and shrinks the engineering pre-work to a short list.

This playbook is grounded in what actually exists in this repo. Companion documents:

| Doc | Purpose |
|---|---|
| [`cutover-runbook.md`](./cutover-runbook.md) | Step-by-step operational runbook (T-4 weeks → T+90 days) |
| [`data-mapping.md`](./data-mapping.md) | GHL export column → CMB Lab destination, normalization tables |
| [`comms-templates.md`](./comms-templates.md) | Every email/message sent to students and coaches |
| [`engineering-gaps.md`](./engineering-gaps.md) | Pre-work backlog with exact file references |

---

## 1. Where we are today (facts, not assumptions)

**The cohort** (from the Feb 2026 GHL "Active students" export, 143 rows — treat as rehearsal data; a fresh export is mandatory at cutover since ~117 of the 140 recorded end dates have since passed):

- 143/143 have an email address — the join key works for everyone.
- Coaches: Jane 67, Tiffany 28, Janelle 16 — and **32 students with no coach assigned** (needs an ops pass before invites).
- 110/143 are 1:1-eligible; 107 have a 1on1 coach name.
- Access plans are free text (`6 months`, `6 Months`, `7 months extension`, `Paid add-on monthly`, …) — needs the normalization table in `data-mapping.md`.
- Progress: 95 have a section recorded (Foundations 37 / Intermediate 26 / Advanced 20 / Finished 8 / Canto-Improvement 4), 85 have a lesson number (1–13 within their section), and module-completion dates exist for M1: 61, M2: 35, M3: 12.
- Coaching context worth preserving: `Loom link` on 112 rows, `homework_type` on 112, `1on1 coaching progress` on 36.

**What the platform already does for us:**

- **Invite-only by design.** There is no self-serve sign-up (`src/middleware.ts` redirects `/sign-up` → `/sign-in`). Accounts are created by staff or webhooks — which *guarantees* the same-email constraint from `PRE-LAUNCH.md` instead of merely asking students to honor it.
- **Bulk invite path exists.** Admin → Students → bulk invite panel accepts a CSV of `first name, last name, email address, role, tags, course end date`, creates Clerk users, upserts `users` rows, sets end date + portal status, and sends a customizable invitation email via GHL webhook or Resend (`src/app/api/admin/students/invitations/route.ts`). Capped at 500 records/request.
- **One-click activation.** The invite link carries a Clerk ticket; `OtpFirstSignIn` auto-accepts it and drops the student on the dashboard. No password required (OTP-first).
- **Auto-linking to GHL.** On `user.created`, the Clerk webhook links the new user to their GHL contact by email across all active locations and pulls their CRM tags (`src/app/api/webhooks/clerk/route.ts`).
- **Bidirectional tag sync, milestone webhooks, feedback webhooks, inactivity alerts** — GHL keeps seeing student activity after migration, so ops automations built on tags keep working.
- **Course scraper is done.** `scripts/ghl-scrape-course.ts` pulls GHL course structure and mirrors videos to Vercel Blob, outputting normalized JSON per course.
- **End dates are readable from GHL** by coaches (`/api/coaching/student-end-date`) and by students via the Lab Assistant — both stay valid because GHL remains the CRM.

**What's missing** (the full list with file refs is in `engineering-gaps.md`; the four that block a smooth migration):

1. **Course JSON importer** — the scraper's output has no consumer; `/admin/course-library/import-from-ghl` was never built.
2. **Progress seeding** — no way to mark prior modules complete and place a student at "Section X, Lesson N". On a linear-progression platform this is *the* trust-critical feature: a student dropped at Lesson 1 after 8 months of work will churn.
3. **Migration reconciliation view** — `active_students` (the GHL snapshot table) has no join to `users`. There is no "who's been invited / activated / linked / placed correctly" report.
4. **Invitation email copy** — the current default still says the platform is "a beta test version… we are inviting you to try it out for fun" (`StudentInvitePanel.tsx`). Must be replaced before any real invite goes out (see `comms-templates.md`).

---

## 2. Principles

1. **Nothing is lost.** Progress position, module completions, plan end date, coach assignment, Loom/homework history references, and stated learning goals all carry over. We tell students this explicitly and prove it on first login ("Welcome back — you're on Intermediate, Lesson 8").
2. **One link, five minutes.** A student's entire migration effort is: click the invite link, enter the OTP code, land on their saved spot.
3. **Same email, enforced by architecture.** Invite-only sign-in means data continuity can't be broken by a student choosing a different email.
4. **Coaches sign off before students arrive.** Each coach verifies their own roster (placement, end date, 1:1 status) in a preview pass. No invite goes out for a student whose coach hasn't approved their row.
5. **Freeze, then move.** From the moment the final export is pulled, no new homework is assigned in GHL and no student data is edited there (contact/CRM edits excepted). One review queue at a time.
6. **Waves, not a big bang.** Pilot (≈10) → coach-by-coach waves → stragglers. Every wave has an activation report before the next goes out.
7. **GHL is archived, not trusted.** The membership portal goes read-only at cutover and off at T+30. Full exports + scraped course JSON + video manifests are archived before anything is disabled.
8. **Reversible until it isn't.** Rollback (re-enable GHL portal) stays possible until T+30. The point of no return is a deliberate management decision, not a side effect.

---

## 3. The four journeys

### 3.1 Students

| Phase | What they experience |
|---|---|
| **T-14 — Heads-up** | Personal email from Sheldon: the new Lab is coming, here's why it's better (auto-pause interactive video, AI grading, pronunciation scoring, streaks, dictionary/reader), everything carries over, nothing to do yet. |
| **T-0 — Invitation** | One email, one button. Copy is personalized: "you're on *{Section}*, Lesson *{N}* — we saved your spot", plan end date shown, coach named. Link auto-signs them in (Clerk ticket → OTP). |
| **First login** | Guided walkthrough (already built: 24-step reader + listening tour), then their course exactly where they left off. A "not the right lesson?" link routes misplacements straight to their coach instead of letting trust erode silently. |
| **First week** | T+3 nudge to non-activated, T+7 final nudge with the GHL-portal-closes date. Lab Assistant handles "when does my access end / who's my coach" questions with the same GHL-sourced answers as before. |
| **Steady state** | All homework, review, feedback, and progress in CMB Lab. GHL portal link dead → redirects/announcement points to the Lab. |

**Journey out of GHL:** students are never asked to export anything or say goodbye to the old portal — it simply goes read-only, with a banner pointing to CMB Lab. DND/unsubscribed contacts are excluded from email sends and handled personally by their coach.

### 3.2 Coaches (Jane, Tiffany, Janelle)

| Phase | What they do |
|---|---|
| **T-21 — Preview** | Coach accounts already exist. They get a walkthrough of the coach hub: submission queue, Loom feedback (already supported in `CoachFeedbackForm`), coaching material tool, end-date card. |
| **T-14 — Roster sign-off** | Each coach reviews a per-coach sheet from the reconciliation view: student, email, section, lesson, end date, 1:1 status, homework type, Loom links. They correct placements and claim/distribute the 32 unassigned students. **Sign-off is a go/no-go gate.** |
| **T-0 → T+14 — Dual-ops window** | Rule: *all new* homework and review happens in CMB Lab; GHL portal is read-only reference for old submissions. Coaches get a daily activation list for their students and personally chase the ones expiring soonest. |
| **T+14 — CMB-only** | GHL review workflow retired. Coach feedback continues to fire `feedback.sent` webhooks to GHL so CRM automations still see engagement. |

### 3.3 Operations

| Phase | What they do |
|---|---|
| **T-28 → T-14 — Data prep** | Normalize free-text fields (access plan, payment status, coach names) per `data-mapping.md`; resolve duplicate/secondary emails; assign the coach-less 32; build the invite CSV from the *rehearsal* export and run a full dry-run against a staging import. |
| **T-14 → T-7 — Rehearsal** | Import rehearsal cohort into staging: bulk `upload_only`, seed progress, verify ten students end-to-end (login, placement, end-date enforcement, tag entitlements, Lab Assistant answers). |
| **T-1 — Freeze + fresh export** | Announce edit freeze, pull fresh "Active students" export, re-run normalization, diff against rehearsal file (expect churn — the Feb export was already 117/140 expired by July), regenerate invite CSV. |
| **T-0 — Import + invites** | `upload_only` for everyone (accounts + end dates + tags exist before any email), progress seeding, coach assignment, then `upload_and_invite`-equivalent resend in waves. |
| **T+1 → T+14 — Verify & chase** | Daily reconciliation report: invited / activated / GHL-linked / placement-confirmed. Manually link any contact the email match missed (`POST /api/admin/ghl/contacts/link` — already handles fallback search). |
| **T+14 → T+90 — Wind-down** | GHL membership portal read-only → off; course-area automations disabled per inventory; archives stored; GHL plan possibly downgraded (CRM-only tier). |

### 3.4 Management

| Phase | What they own |
|---|---|
| **T-28** | Approve scope decision (GHL stays as CRM), courtesy-extension policy (recommend +14 days on every migrated plan as a goodwill buffer), and the go/no-go criteria below. |
| **T-7 — Go/No-Go** | Gate: content QA passed, coach sign-offs complete ×3, rehearsal cohort verified, comms approved, support rota staffed. |
| **T+1 → T+30 — Dashboard** | Daily: % invited, % activated, % activated among expiring-≤30d, misplacement reports, support volume. Weekly active learners vs. GHL baseline (`Last_Portal_Login` / `login_counter` from the final export = the baseline). |
| **T+30 — Retro + portal-off decision** | If activation ≥85% and misplacement reports resolved: turn GHL portal off. |
| **T+90 — Contract decision** | Downgrade or keep GHL based on what marketing still uses. Point of no return only here. |

---

## 4. Timeline at a glance

```
Week -4   Engineering pre-work (importer, progress seeding, reconciliation view, email copy)
          Content scrape + video mirror + import into staging
Week -3   Content QA (quizzes rebuilt, audio lessons re-attached — scraper drops both)
          Coach preview + training
Week -2   Roster sign-off per coach · data normalization · staging rehearsal
Week -1   T-14 heads-up email · Go/No-Go review · pilot wave (~10 students, one per segment)
Day 0     Freeze · fresh export · import all (accounts, end dates, tags, coach, progress)
          Invite Wave 1: expiring ≤30 days (with coach follow-up same day)
Day 1-2   Invite Waves 2-4: by coach (Jane / Tiffany / Janelle+unassigned)
Day 3     Nudge #1 to non-activated
Day 7     Nudge #2 + "GHL portal goes read-only on {date}"
Day 14    GHL portal read-only · dual-ops ends · coaches CMB-only
Day 30    Portal off (if gate passed) · retro
Day 90    GHL contract decision
```

Wave order rationale: students closest to expiry have the least slack to absorb friction, so they get the invite first, the courtesy extension, and same-day personal follow-up from their coach.

---

## 5. Go/No-Go criteria (T-7)

All must be true:

- [ ] All CMBP + Improve Canto course content imported; spot-check of 10 lessons per module passes (video plays, interactions fire, quiz exists where GHL had one).
- [ ] Progress seeding verified on rehearsal cohort: module completions dated correctly, current lesson unlocked, next lesson locked.
- [ ] 3/3 coach roster sign-offs, zero unassigned students remaining.
- [ ] Invitation email rewritten and approved (no "beta / for fun" copy), send tested via both GHL webhook and Resend fallback.
- [ ] Reconciliation report runs and matches: export rows = users rows = invite list (minus documented exclusions).
- [ ] Lab Assistant answers end-date/coach questions correctly for 5 rehearsal students.
- [ ] Rollback rehearsed: GHL portal re-enable steps documented and tested on one course.
- [ ] Support rota staffed for Days 0–7; escalation path (Lab Assistant → GHL task → Discord ping) verified.

## 6. Success metrics

| Metric | Target | Source |
|---|---|---|
| Activation (first login) by T+7 | ≥ 70% | reconciliation report |
| Activation by T+14 | ≥ 85% | reconciliation report |
| Activation among expiring-≤30d by T+3 | ≥ 90% | reconciliation report |
| Placement disputes ("wrong lesson") | < 5%, all resolved ≤ 48h | coach reports |
| Support tickets re: login/access | trending to zero by T+10 | Lab Assistant + GHL tasks |
| Weekly active learners at T+30 | ≥ GHL baseline from final export | analytics dashboard |

## 7. Risks & rollback

Top risks and mitigations (register maintained in the runbook):

| Risk | Mitigation |
|---|---|
| Wrong lesson placement destroys trust | Coach sign-off gate + in-app "not the right spot?" report link + 48h fix SLA |
| Stale export → wrong cohort/end dates | Fresh export inside freeze window is a hard runbook step; Feb file is rehearsal-only |
| Free-text field mis-normalization | Normalization tables with an explicit REVIEW bucket; unmapped values block the import, never guess |
| Students near expiry churn during switch | First wave + courtesy extension + personal coach follow-up |
| GHL automations keep emailing about the old portal | Automation inventory + staged disable checklist in the runbook (126 students carry `temporary_zapier_webhook_general` — live Zapier hooks must be inventoried too) |
| Missed video mirrors (~30GB, 400+ files) | Scraper manifest diff vs. GHL post count; re-run is resumable |
| DND contacts emailed | DND column → suppression list; coach handles personally |

**Rollback:** possible until T+30 with no data loss, because GHL is read-only, not deleted. Trigger: activation < 40% at T+14, systemic data-integrity failure, or platform instability. Steps: pause invites → flip GHL portal back on → "we're taking more time" email → CMB Lab continues as opt-in beta → post-mortem. After T+90 (contract decision) rollback ceases to be an option — that's deliberate.

## 8. Decisions needed from management

| # | Decision | Recommendation |
|---|---|---|
| D1 | GHL scope after migration | Keep as CRM/marketing; retire membership portal only. All existing integrations assume this. |
| D2 | Courtesy extension on migrated plans | +14 days for everyone, applied in the invite CSV end dates. Cheap goodwill; protects the expiring-soon wave. |
| D3 | The 32 coach-less students | Distribute by coach load before sign-off week (Jane is at 67 — weight toward Tiffany/Janelle). |
| D4 | The 33 non-1:1 students | Same migration path; confirm which tags gate 1:1 features so they don't see coaching surfaces they didn't buy. |
| D5 | GHL portal read-only date vs. hard-off date | T+14 read-only, T+30 off, gated on the T+30 metric review. |
