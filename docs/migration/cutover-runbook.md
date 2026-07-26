# Cutover Runbook

Operational, step-by-step. Owner column assumes: **Ops** = Jackey/ops team, **Eng** = engineering, **Coach** = Jane/Tiffany/Janelle, **Mgmt** = Sheldon.

Pre-requisite: every item in `engineering-gaps.md` marked **[BLOCKER]** is shipped.

---

## Phase 0 — Engineering & content (Week -4 → -3)

| # | Step | Owner | How |
|---|---|---|---|
| 0.1 | Ship the [BLOCKER] gap items (course importer, progress seeding, reconciliation view, invite email copy) | Eng | `engineering-gaps.md` |
| 0.2 | Scrape GHL courses | Eng | `npx tsx scripts/ghl-scrape-course.ts --products <ids>` with fresh `GHL_COOKIE`/`GHL_TOKEN_ID` from a logged-in session. Re-run until the manifest diff vs. GHL post count is zero (script is resumable). |
| 0.3 | Import scraped JSON into **staging** Course Library | Eng | New importer (gap #1). |
| 0.4 | Rebuild what the scraper drops | Ops + Coach | Quizzes arrive as empty shells and audio posts as text (`ghl-scrape-course.ts` `mapPostToLesson`) — list every GHL quiz/audio post from the JSON, rebuild quizzes in QuizBuilder, re-attach audio. Track in a checklist; this is the long pole of content QA. |
| 0.5 | Content QA: 10 lessons per module | Coach | Video plays, interactions pause correctly, quiz present where GHL had one, downloads attached. |
| 0.6 | Pre-create carry-over tags + verify tag→entitlement grants | Ops | `/admin/tag-access`; list in `data-mapping.md` §5. |
| 0.7 | Verify GHL API location tokens + webhook secrets | Eng | `/admin/ghl` → Location Manager → Test connection, both sub-accounts (marketing + course). |

## Phase 1 — People prep (Week -3 → -2)

| # | Step | Owner |
|---|---|---|
| 1.1 | Coach training session on staging: submission queue, Loom feedback, coaching material, end-date card, where migrated notes live | Ops |
| 1.2 | Distribute the 32 coach-less students (D3) | Mgmt |
| 1.3 | Normalize rehearsal export per `data-mapping.md`; produce exceptions sheet (unparseable plans, duplicate emails, name artifacts, the lesson-22 outlier) | Ops |
| 1.4 | Generate per-coach roster sheets from the reconciliation view; coaches verify **every row**: section, lesson, end date, 1:1 status | Coach |
| 1.5 | Coach sign-off recorded (3/3). Unresolved rows → exceptions sheet, not silently imported | Coach → Mgmt |

## Phase 2 — Rehearsal (Week -2)

| # | Step | Owner |
|---|---|---|
| 2.1 | Full dry-run on staging: bulk `upload_only` import (chunk ≤500), progress seed, coach assign, tag apply | Ops |
| 2.2 | End-to-end verification on 10 rehearsal students: invite link → OTP login → walkthrough → correct lesson unlocked → locked lesson actually locked → end date enforced (set one to yesterday, confirm lock + `access=expired` banner) → Lab Assistant answers end-date/coach correctly | Ops + Eng |
| 2.3 | Test invitation email through **both** paths (GHL webhook `GHL_INVITATION_WEBHOOK_URL` and Resend fallback); check spam placement on Gmail/Outlook/Yahoo | Ops |
| 2.4 | Rehearse rollback: re-enable one GHL course for one test contact, confirm the steps in §Rollback work | Ops |
| 2.5 | GHL automation inventory: every workflow/Zap that emails students about the course area or fires on course tags. Mark each: keep / disable-at-T0 / disable-at-T14. The `temporary_zapier_webhook_general` tag (126 students) means live Zaps exist — find them | Ops |

## Phase 3 — Announce (Week -1)

| # | Step | Owner |
|---|---|---|
| 3.1 | T-14 heads-up email to all active students via GHL (template 1) | Mgmt |
| 3.2 | Go/No-Go review against the criteria in `README.md` §5 | Mgmt |
| 3.3 | Pilot wave: ~10 students (mix of sections, one per coach, at least one expiring-soon volunteer). Full invite → activation → 48h observation | Ops |
| 3.4 | Pilot retro; fix anything that generated a support touch | All |

## Phase 4 — Cutover (Day 0)

Order matters: **accounts first, emails second** — every student must already have end date, tags, coach, and progress before their invite lands.

| # | Step | Owner |
|---|---|---|
| 4.1 | Announce freeze to team: no GHL edits to student fields, no new GHL homework from now on | Ops |
| 4.2 | Pull **fresh** "Active students" export; re-run normalization; diff vs. rehearsal file; re-verify rows that changed (new students since rehearsal get a fast-track coach check) | Ops |
| 4.3 | Refresh `active_students` snapshot (`import_contacts.py` — note it drop-recreates the table) so the reconciliation view reflects the final cohort | Eng |
| 4.4 | Bulk import `upload_only` (chunks ≤500): creates Clerk users + `users` rows, sets `cmbCourseEndDate` (with D2 extension) + portal status + tags | Ops |
| 4.5 | Bulk coach assignment (`bulk-assign-coach`) per normalized coach column | Ops |
| 4.6 | Run progress seeding (gap #2) from the mapped `(section, lesson, M1/M2/M3 dates)` | Eng |
| 4.7 | Import coaching-context notes (Loom links, homework type, goals) onto student profiles | Eng |
| 4.8 | Reconciliation check: export rows = users rows = seeded rows; investigate every diff before sending anything | Ops |
| 4.9 | **Wave 1 invites: expiring ≤30 days.** Same-day personal follow-up from their coach | Ops + Coach |
| 4.10 | Disable "disable-at-T0" GHL automations per inventory | Ops |

## Phase 5 — Waves & chase (Day 1 → 14)

| # | Step | Owner |
|---|---|---|
| 5.1 | Day 1–2: Waves 2–4 by coach (Jane, Tiffany, Janelle+formerly-unassigned). Cap waves so each coach can follow up personally | Ops |
| 5.2 | Daily reconciliation report to coaches + mgmt: invited / activated / GHL-linked / placement-confirmed / DND-personal-outreach list | Ops |
| 5.3 | Manually link any user the email auto-link missed: `POST /api/admin/ghl/contacts/link` (falls back to general email query). Check the sync-event log for `contact.reverse_linked` failures | Ops |
| 5.4 | Day 3: nudge #1 to non-activated (template 3). Day 7: nudge #2 with portal-read-only date (template 4) | Ops |
| 5.5 | Placement disputes: coach fixes within 48h (progress-seed correction), replies personally | Coach |
| 5.6 | Invite expiry watch: Clerk invitations expire in 14 days — resend (`action: resend_invite`) for anyone approaching expiry unactivated | Ops |
| 5.7 | Day 14: GHL membership portal → read-only banner pointing to CMB Lab; coaches stop checking GHL queues | Ops |

## Phase 6 — Wind-down (Day 14 → 90)

| # | Step | Owner |
|---|---|---|
| 6.1 | T+30 metric review vs. targets (`README.md` §6). If passed: GHL portal **off**; remaining course-area automations disabled | Mgmt |
| 6.2 | Archive per `data-mapping.md` §7 | Ops |
| 6.3 | Retro: what generated support volume, what to automate for future cohorts (new students post-migration onboard via Fanbasis `/api/public/enroll` or admin invite — document the steady-state path) | All |
| 6.4 | T+90: GHL contract decision (downgrade to CRM-only tier vs. keep). **Point of no return** | Mgmt |

---

## Rollback (valid until T+30)

**Triggers:** activation < 40% at T+14 · systemic placement/data failure · platform instability affecting learning.

1. Pause all remaining invites and nudges.
2. Re-enable GHL membership portal + re-enable the disabled automations from the inventory.
3. Email (template 6-alt): "we're taking more time to make this perfect — keep using the current portal; nothing changes for you."
4. CMB Lab stays live, opt-in, for already-activated students (their progress is real; don't take it away).
5. Post-mortem before any second attempt.

Nothing in Phases 0–5 deletes GHL data, so rollback is configuration, not restoration.

---

## Support playbook (Days 0–14)

- **"I can't log in"** → check invite status in admin (resend if expired); confirm they're using the invited email; OTP goes to spam sometimes — resend code.
- **"I'm at the wrong lesson"** → coach fixes seed, replies within 48h. Track count (metric).
- **"When does my access end?"** → Lab Assistant answers from GHL (unchanged); coaches see it on the end-date card.
- **"Where's my old homework/feedback?"** → GHL portal is read-only until T+30 for reference; Loom links were carried onto their profile.
- **DND / no-email students** → coach personal outreach list from Day 0.
- Escalation chain: Lab Assistant → GHL task on the contact (+ Discord ping) → ops rota.
