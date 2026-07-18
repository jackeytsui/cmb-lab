# CMB Operations Scaling Roadmap — Detailed Action Plan

> **Rev A · 2026-07-18** · Companion to [`SCALING-BLUEPRINT.md`](./SCALING-BLUEPRINT.md).
> Ticket-level plan: 4 horizons · 8 workstreams · 30 tickets with acceptance criteria, target files, effort, and dependencies.

**How to use this doc**
- Tickets are IDs (`OPS-1xx` = Horizon 1, etc.). Work top-to-bottom within a horizon; dependencies are explicit.
- Effort: **S** = ≤1 day · **M** = 2–4 days · **L** = 1–2 weeks.
- Owner roles: **Eng** (LMS/dev) · **Ops** (ops lead) · **CM** (community manager) · **Coach** · **Sheldon** (decisions/content).
- Each horizon ends with a **Definition of Done** — don't start the next horizon's builds until the DoD holds.

**Workstreams**

| WS | Name | Doctrine move |
|---|---|---|
| WS1 | Reliability & leak-fixes | (foundation) |
| WS2 | Health Score & data spine | Instrument |
| WS3 | Ops Command Center | Instrument |
| WS4 | Retention Engine | Instrument + Deflect |
| WS5 | Coach Copilot | Amplify |
| WS6 | Discord Community Engine | Deflect + Instrument |
| WS7 | Support & Deflection | Deflect |
| WS8 | Team, SOPs & Cadence | (foundation) |

---

## Horizon 1 — Stop the leaks (Days 1–30)

Goal: reclaim hours and de-risk the foundation with near-zero build. Everything here is small, concrete, and pays back immediately.

### OPS-101 · Fix the webhook-retry cron cadence — WS1 · Eng · **S**
**Why:** `/api/cron/ghl-webhooks` retries failed GHL deliveries. Code comments say every 10 minutes; `vercel.json` schedules it **daily at 07:00 UTC**. Failed milestone/feedback webhooks (which drive GHL nurture emails) can sit ~24h.
**Do:**
- Change `vercel.json` schedule to `*/10 * * * *` (requires Vercel Pro for sub-daily crons — if unavailable, create an n8n Schedule-trigger workflow that calls the endpoint every 10 min with the `CRON_SECRET` bearer header; this also fits the "n8n as event bus" doctrine).
**Accept:** a synthetically failed `sync_events` row is retried within ≤10 minutes.
**Files:** `vercel.json`, `src/app/api/cron/ghl-webhooks/route.ts` (no logic change).

### OPS-102 · Access/role expiration cron + offboarding events — WS1/WS4 · Eng · **M**
**Why:** `expiresAt` is only lazy-checked in `src/lib/permissions.ts`. Access silently lapses: no offboarding email, no win-back sequence, no renewal signal — a silent retention/revenue leak.
**Do:**
- New `GET /api/cron/expire-access` (CRON_SECRET-auth, same pattern as `ghl-inactive`): find role assignments & course access with `expiresAt <= now` not yet processed; mark processed; create in-app notification.
- Add `access.expired` event type to `WebhookDispatcher` (`src/lib/ghl/webhooks.ts`) so GHL can trigger offboarding/win-back workflows; log to `sync_events`.
- Register in `vercel.json` (daily is fine here).
**Accept:** expiring a test role fires exactly one `access.expired` webhook (idempotent on re-run) and the student's GHL contact gets the event/tag.
**Files:** `src/app/api/cron/expire-access/route.ts` (new), `src/lib/ghl/webhooks.ts`, `src/lib/user-roles.ts`, `vercel.json`.

### OPS-103 · Implement the `no_progress_days` auto-tag evaluator — WS1/WS4 · Eng · **S/M**
**Why:** `autoTagRules` (`src/db/schema/tags.ts`) defines three condition types; only `inactive_days` is evaluated (in `ghl-inactive` cron). "Logging in but not progressing" is a distinct, earlier churn signal than "not logging in."
**Do:** In the daily cron, evaluate rules with `conditionType = 'no_progress_days'`: no new `lessonProgress` completion and no `dailyActivity` XP row within N days → assign tag → existing `syncTagToGhl` pushes it to GHL automatically.
**Accept:** a rule "no progress 10 days → tag `Stalled`" tags a fixture student and the tag appears on their GHL contact.
**Files:** `src/app/api/cron/ghl-inactive/route.ts`, `src/lib/tags.ts`.

### OPS-104 · Implement the `course_completed` auto-tag evaluator — WS1/WS4 · Eng · **S**
**Why:** Same gap; completing a course should trigger tags (upsell eligibility, testimonial ask, next-course nurture) without manual tagging.
**Do:** Hook rule evaluation into the existing course-completion detection in `src/lib/ghl/milestones.ts` (where `course.completed` webhooks already dispatch) — evaluate matching `autoTagRules` and assign tags inline.
**Accept:** completing the final lesson of a course assigns the configured tag and syncs to GHL within one sync cycle.
**Files:** `src/lib/ghl/milestones.ts`, `src/lib/tags.ts`.

### OPS-105 · Make the `activeStudents` sync a first-class, monitored job — WS1/WS2 · Eng + Ops · **M**
**Why:** The ~90-column GHL mirror (`src/db/schema/active-students.ts`) powers the admin Students tab, but **no syncer exists in the repo** — it's populated by an unknown external process. This is the single point of failure under the whole ops view, and a hard prerequisite for the Command Center (OPS-203).
**Do:**
- Locate/document the current external process (Ops).
- Rebuild as an owned n8n workflow: nightly GHL contacts export → upsert into `activeStudents` (via a new secret-authed `POST /api/admin/students/sync` bulk-upsert endpoint, or direct Neon node).
- Freshness monitor: surface `max(updatedAt)` on the admin Students page; n8n alert to an ops Discord channel if stale > 36h.
**Accept:** kill the sync for a day → alert fires; staleness is visible in-app; re-run backfills cleanly (idempotent upsert on Contact Id).
**Files:** n8n workflow (export JSON into `docs/operations/n8n/`), `src/app/api/admin/students/sync/route.ts` (new), admin students page freshness badge.

### OPS-106 · Uncap and parameterize the inactivity sweep — WS1 · Eng · **S**
**Why:** `ghl-inactive` caps at 20 dispatches/run. At ~2,189 students a churn wave silently exceeds the cap; the 7-day threshold is hardcoded.
**Do:** batch-process until done (respecting the GHL client's rate limiter), make threshold & cap env/app-setting configurable, log processed/skipped counts to `sync_events`.
**Accept:** a run with 50 newly-inactive fixtures dispatches all 50 within rate limits.
**Files:** `src/app/api/cron/ghl-inactive/route.ts`.

### OPS-107 · Sync-failure alerting to Discord ops channel — WS1 · Eng · **S**
**Why:** `sync_events` records failures but nobody is notified; the SyncEventLog admin table is pull-only.
**Do:** n8n scheduled workflow (every 30 min): query failed `sync_events` in window → post summary to a private `#ops-alerts` Discord channel via webhook.
**Accept:** a forced webhook failure produces a Discord alert within 30 min.
**Files:** n8n workflow; optionally a `GET /api/admin/ghl/sync-events?status=failed&since=` param (may already exist).

### OPS-108 · Expand Lab Assistant scope with the top-20 questions — WS7 · Sheldon + Ops + Eng · **M**
**Why:** The bot resolves 5 launch intents at a ≥60% gate. Deflection is the cheapest capacity we can buy; the marginal cost of each added intent is near zero.
**Do:**
- Ops mines GHL support tickets/conversations for the top 20 recurring questions (billing/refund policy, tech issues, curriculum path, Discord access, coach change, schedule, certificate…).
- Update the `lab-assistant-guidance` prompt via **Admin → Manage Portal** (no deploy needed) for answerable ones; add new intents to `src/lib/lab-assistant/allowlist.ts` + intent-scan schema where structured data is needed.
- Keep the data-gatekeeping discipline: any new GHL field exposure goes through the allowlist + field-mapping flow only.
**Accept:** in-scope resolution rate (admin widget, 30d) trends ≥70%; zero data-scope incidents.
**Files:** `src/lib/lab-assistant/allowlist.ts`, `src/app/api/lab-assistant/route.ts`, guidance prompt (in-app).

### OPS-109 · Stand up the SOP base — WS8 · Ops (owner) + all · **M** (no code)
**Why:** You can't scale the *team* without documented process; prerequisite for ops hire #1 (OPS-404).
**Do:** Notion (or Trainual) workspace with runbooks: enrollment troubleshooting, refund/access changes, tag taxonomy (the master list + what each tag triggers in GHL), escalation SLAs, Discord moderation, coach review workflow, "what to do when sync breaks."
**Accept:** a new team member can resolve the 5 most common ops tasks using only the SOP base.

### OPS-110 · Capture KPI baselines — WS8 · Eng + Ops · **S**
**Why:** Blueprint targets are directional until baselined.
**Do:** One-time queries, recorded in the SOP base:
- Deflection: `sync_events` `lab_assistant.intent_scan` payloads (resolved rate, escalations).
- Feedback turnaround: `submissions.createdAt` → `coachFeedback.createdAt` median/p90.
- Engagement: WAU from `dailyActivity`; streak distribution.
- Renewal exposure: distribution of `activeStudents` end dates over next 90 days.
**Accept:** baseline table in SOP base; scoreboard targets confirmed or revised.

**H1 Definition of Done:** all red "leak" rows from the audit are closed or owned; baselines recorded; SOP base live; `activeStudents` sync owned + monitored.

---

## Horizon 2 — Instrument & see (Days 31–90)

Goal: one score, one screen, and the first automated retention plays.

### OPS-201 · Student Health Score v1 (schema + engine) — WS2 · Eng · **L**
**The central instrument everything else routes on.**
**Schema:** new `student_health_scores` table: `userId`, `score` (0–100), `band` (`green|amber|red`), `components` (jsonb breakdown), `computedAt`. Keep history (append) for trend lines.
**Formula v1 (weights sum 100; tune after 30 days of data):**

| Component | Weight | Signals (existing tables) |
|---|---|---|
| Engagement | 30 | Days since last `dailyActivity` row (0d=full → 14d+=0); 7-day XP sum vs `users.dailyGoalXp`; `activeStudents.lastPortalLogin` as fallback |
| Mastery | 20 | SRS adherence: due `srsCards` reviewed on time (`srsReviews`); practice score trend (`practice` results); tone accuracy trend |
| Coaching | 20 | Submission cadence (`submissions.createdAt` recency/frequency); session attendance (`coachingSessions`) for 1:1/Inner Circle students |
| Community | 15 | Discord messages & check-ins per week (from OPS-206/305 ingest; weight renormalizes across other components until it lands) |
| Commercial | 15 | Days to `activeStudents` product END date; payment status; latest NPS response |

**Bands:** green ≥70 · amber 40–69 · red <40. Entitlement-aware: coaching component only applies to students whose plan includes coaching.
**Accept:** nightly job scores all active students in <5 min; spot-check 10 students against manual judgment; component breakdown visible per student.
**Files:** `src/db/schema/health.ts` (new) + migration, `src/lib/health-score.ts` (new), `src/app/api/cron/health-score/route.ts` (new) or n8n-triggered.

### OPS-202 · Health band → tags + `health.changed` events — WS2 · Eng · **S/M** · *depends OPS-201*
**Do:** on band transition, swap system tags (`Health: Green/Amber/Red`) via `src/lib/tags.ts` (existing `syncTagToGhl` pushes to GHL for free) and dispatch a `health.changed` webhook (extend `WebhookDispatcher`). Debounce: no re-fire within 7 days for the same transition.
**Accept:** forcing a fixture student red produces the GHL tag and exactly one event; GHL workflows can trigger on the tag.
**Files:** `src/lib/health-score.ts`, `src/lib/ghl/webhooks.ts`, `src/lib/tags.ts`.

### OPS-203 · Ops Command Center v1 — WS3 · Eng · **L** · *depends OPS-105, OPS-201*
**One pane of glass at `admin/ops`.** Panels, each a ranked worklist (not a chart):
1. **Today's queues** — pending submissions (count + oldest age, from `submissions` where `pending_review`), open escalations (Lab Assistant `sync_events` + GHL tasks), unreviewed threads/pronunciation.
2. **Retention radar** — red/amber students sorted by commercial value (`activeStudents.paidTotal`), with one-click links to profile + GHL contact.
3. **Renewal pipeline** — end dates in 30/14/7-day buckets with health band chip.
4. **Coach load** — students per coach (`users.assignedCoachId`) vs pending review items per coach.
5. **System health** — deflection rate (30d), feedback-turnaround SLA, `activeStudents` freshness, failed sync events.
Reuse existing analytics endpoints where possible (`api/admin/analytics/*`); add `GET /api/admin/ops/overview` for the rest.
**Accept:** ops morning routine ("what needs me today?") completes from this single page; every row links to the action surface.
**Files:** `src/app/(dashboard)/admin/ops/page.tsx` (new) + components, `src/app/api/admin/ops/overview/route.ts` (new).

### OPS-204 · Renewal sequence (T-30/14/7), health-gated — WS4 · Eng + Ops · **M** · *depends OPS-201, OPS-105*
**Do:** daily n8n workflow reads upcoming end dates (via `activeStudents`): T-30/14/7 → apply system tags (`Renewal-30d` etc. — auto-sync to GHL) driving GHL nurture. **Gate:** red-band students get a *coach save task* (GHL task via `src/lib/ghl/tasks.ts` pattern) instead of an upsell email — don't sell to someone who's drowning.
**Accept:** fixture students at each threshold receive the correct tag/task exactly once; red students never enter the upsell branch.
**Files:** n8n workflow (JSON in `docs/operations/n8n/`), GHL workflows (Ops), optional endpoint reuse.

### OPS-205 · At-risk save play (tiered) — WS4 · Eng + Ops + CM · **M** · *depends OPS-202*
**Do:** on `health.changed` → red, n8n runs the escalation ladder:
- **Day 0:** personalized nudge email/SMS via GHL (template referencing their stalled point — module/lesson from `activeStudents`).
- **Day 3:** Discord DM from the bot with a concrete micro-goal (e.g., 1 SRS session) + community invite.
- **Day 7 (still red):** GHL task for the assigned coach + Command Center queue entry.
Exit the ladder immediately on band improvement. Log every touch to `sync_events` for the recovered-rate KPI.
**Accept:** end-to-end fixture run executes all three tiers with correct timing and early-exit on recovery.
**Files:** n8n workflow, GHL templates (Ops), bot DM (with OPS-206 bot).

### OPS-206 · Discord two-way role sync + provisioning — WS6 · Eng · **M/L**
**Why:** `/api/webhooks/discord` already grants LMS roles from Discord; the reverse direction (entitlement → Discord role) is manual.
**Do:**
- Stand up the CMB bot (n8n Discord node or small bot service) mapping product line / access plan → Discord roles (Inner Circle, 1:1, Accelerator channels).
- n8n listens to `enrolled` / `access.expired` (OPS-102) events → add/remove Discord roles by matched email/Discord ID.
- Nightly reconcile: diff entitlements vs actual Discord roles, auto-fix, report drift to `#ops-alerts`.
- Ingest message counts per member per week → feed Health Score community component (OPS-201).
**Accept:** enroll/expire round-trips to Discord roles in <5 min; reconcile report shows zero unexplained drift after week 1.
**Files:** n8n workflows, `src/app/api/webhooks/discord/route.ts` (extend if needed), Discord ID ↔ email mapping table if not present.

### OPS-207 · Discord structured onboarding flow — WS6 · CM + Eng · **M**
**Do:** Discord native onboarding (rules screen → intro prompt → goal selection → server tour) ending in a `Onboarded` completion role; completion event feeds the Health Score and triggers a welcome touch. Celebrate completions weekly.
**Accept:** ≥70% of new members complete onboarding in week 1; completion visible in Health Score components.

**H2 Definition of Done:** every active student has a nightly Health Score; ops day runs from the Command Center; renewal + at-risk plays firing automatically; Discord roles fully synced to entitlements.

---

## Horizon 3 — Amplify the coaches (Months 4–6)

Goal: 5–10× per coach. Judgment stays human; everything around it becomes drafted and one-click.

### OPS-301 · Feedback-draft copilot — WS5 · Eng · **L**
**Why:** AI already pre-grades (`src/lib/assignment-scoring.ts`, `practice-grading.ts`) but coaches write all final feedback from scratch.
**Do:** extend the grading pipeline (via existing n8n webhook pattern) to produce, per submission: (a) a draft written feedback in the coach's voice (few-shot from that coach's past `coachFeedback`), (b) 3–5 Loom talking points, (c) suggested next practice assignment. Store on the submission; coach UI gets **Edit & Send** — *sending is always a human act*.
**Accept:** coaches accept-with-edits ≥60% of drafts (track edit distance); median feedback turnaround drops ≥40% vs OPS-110 baseline; no draft auto-sends.
**Files:** n8n grading workflow, `src/lib/assignment-scoring.ts`, submission review UI (`coach/submissions/`), `coachFeedback` draft column/migration.

### OPS-302 · Auto session-prep briefs — WS5 · Eng · **M** · *depends OPS-201*
**Do:** T-24h before each `coachingSessions` entry, n8n compiles a one-pager: health score + trend, progress since last session (`lessonProgress`, XP), weak areas (Smart Study engine data in `study.ts`), last session's `coachingNotes` + goals, open action items. Rendered in the coach console on the session page; optional email/Discord DM to the coach.
**Accept:** coaches rate briefs useful ≥4/5 in a 2-week trial; prep time per session drops from ~15 min to <3 min.
**Files:** n8n workflow, `src/app/api/coaching/sessions/` brief endpoint, coach session UI.

### OPS-303 · Fathom → notes → GHL closed loop — WS5 · Eng · **M/L**
**Why:** `coachingSessions.fathomLink` is stored manually today; notes are hand-written after calls.
**Do:** Fathom webhook (or Zapier→n8n bridge if webhook unavailable) on new recording → n8n matches to session by attendee email/time → LLM structured summary (topics covered, homework assigned, student blockers, sentiment) → draft `coachingNotes` entry + `fathomLink` auto-filled + GHL contact note. Coach approves/edits the draft in the console.
**Accept:** ≥90% of recorded sessions auto-match; note-writing time → near zero; drafts never publish without coach approval.
**Files:** n8n workflow, `src/app/api/coaching/` draft-note endpoint, coaching notes UI.

### OPS-304 · Feedback QA sampling — WS5 · Eng + Sheldon · **S/M**
**Do:** weekly n8n job samples ~10% of the week's `coachFeedback`, scores against a rubric Sheldon signs off (specificity, actionability, tone, Canto→Mando pedagogy) via LLM, posts a scorecard to the Command Center + `#ops-alerts`. Human review of any low-scoring sample before it's treated as signal.
**Accept:** weekly scorecard exists; rubric drift discussed at the weekly ops review (OPS-405 cadence).

### OPS-305 · Discord accountability bot — WS6 · CM + Eng · **M/L** · *depends OPS-206*
**Do:** streak check-ins (`dailyActivity` streaks surfaced as Discord kudos), study-room pomodoro sessions, daily SRS nudges ("You have 12 cards due — 4 min"), weekly cohort challenges. All activity ingested back into the Health Score community component.
**Accept:** ≥25% of Discord members interact with the bot weekly; measurable lift in SRS adherence for participants.

### OPS-306 · Milestone celebrations pipeline — WS6 · Eng · **S**
**Do:** `module.completed` / `course.completed` / certificate events → opt-in Discord announcements (n8n listener on the existing WebhookDispatcher events).
**Accept:** completions post within minutes; opt-out respected via notification preferences.

### OPS-307 · Coach load balancing — WS3/WS5 · Eng · **S/M** · *depends OPS-203*
**Do:** Command Center coach-load panel gains assignment suggestions: on new coached-plan enrollment, suggest the coach with lowest weighted load (students × pending reviews × upcoming sessions). One-click assign (reuses `bulk-assign-coach` endpoint).
**Accept:** new students assigned within 24h; load variance across coaches shrinks.

**H3 Definition of Done:** coaches spend the majority of their time in judgment/teaching acts; feedback SLA <24h at current headcount; admin time per coach cut ≥50% vs baseline.

---

## Horizon 4 — Compound & intelligent ops (Months 6–12)

Goal: reinvest reclaimed capacity into delivering more per student, and make the system self-routing.

### OPS-401 · Agentic escalation triage — WS7 · Eng · **L**
n8n AI-agent workflow reads new GHL escalation tasks (Lab Assistant + form-submitted), classifies (billing / tech / coaching / churn-risk), drafts a reply or resolution steps, routes to the right owner with context attached. Human sends; agent learns from edits. **Accept:** median escalation time-to-first-response <4h; misroute rate <10%.

### OPS-402 · GHL Conversation AI front-of-funnel — WS7 · Ops + Sheldon · **M**
Enable GHL's AI Employee / Conversation AI (~$97/mo unlimited tier) on SMS/email/DM channels for pre-sale and simple account questions, trained on the same top-20 corpus (OPS-108). Handoff rules to human inbox mirror the Lab Assistant's escalation discipline. **Accept:** front-of-funnel response time <3 min 24/7; no student-data exposure (it answers policy/product, not account internals — account questions stay with the gatekept Lab Assistant).

### OPS-403 · Health-gated expansion plays — WS4 · Ops + Eng · **M** · *depends OPS-201/204*
Use `activeStudents` upsell fields (`upsell recommend`, coach notes) + green-band + course-completion tags (OPS-104) to trigger automated, coach-endorsed expansion offers (1:1 add-on, Accelerator, renewal-plus). Never offer to amber/red. **Accept:** expansion revenue attributable to the play; zero offers sent to red-band students.

### OPS-404 · Ops hire #1 — WS8 · Sheldon · **—**
Hire a dedicated ops coordinator onboarded entirely from the SOP base (OPS-109); they own Command Center queues, escalations, Discord ops, and the weekly scorecard — freeing coaches to teach and Sheldon to build. **Accept:** ramped to independent queue ownership in ≤2 weeks (the SOP base test).

### OPS-405 · Quarterly automation review + weekly ops cadence — WS8 · all · **recurring**
- **Weekly (30 min):** run the ops review from the Command Center — queues, scoreboard vs targets, one automation improvement shipped/week.
- **Quarterly:** audit all n8n workflows + GHL automations; retire duplicates, consolidate, re-baseline KPIs, tune Health Score weights against actual churn outcomes (did red predict churn? did saves work?).
**Accept:** scoreboard reviewed weekly without prep; Health Score precision/recall on churn improves quarter over quarter.

### OPS-406 · Reinvest capacity: deliver more — Sheldon + Coach · ongoing
With admin cut, add deliverables that scale one-to-many: weekly group office hours, monthly challenges (bot-run), curated feedback compilations, faster SLA as a marketed promise. This is where "deliver more" becomes visible to students.

**H4 Definition of Done:** 1,500+ students/coach supportable; deflection ≥80%; retention +10 pts vs baseline; ops runs day-to-day without founder involvement.

---

## Dependency map (critical path)

```
OPS-105 (activeStudents sync) ──┬─→ OPS-201 (Health Score) ─→ OPS-202 (bands/tags) ─→ OPS-205 (save play)
OPS-102 (expiry events) ────────┤                          └─→ OPS-204 (renewals) ─→ OPS-403 (expansion)
OPS-103/104 (rule evaluators) ──┘        OPS-201 ─→ OPS-203 (Command Center) ─→ OPS-307 (load balancing)
OPS-206 (Discord sync) ─→ OPS-207 (onboarding) ─→ OPS-305 (accountability bot)
OPS-108 (top-20 corpus) ─→ OPS-401 (agentic triage) · OPS-402 (Conversation AI)
OPS-109 (SOP base) ─→ OPS-404 (ops hire)
```

**Critical path: OPS-105 → OPS-201 → OPS-203.** If only three things ship in the next 90 days, ship these.

## Measurement (wire into Command Center from H2)

| KPI | Source | Baseline (OPS-110) | Target |
|---|---|---|---|
| Students / coach | `users.assignedCoachId` counts | ~730 | 1,500+ |
| Deflection rate | `sync_events` `lab_assistant.*` | ≥60% in-scope | 80%+ |
| Feedback turnaround p50/p90 | `submissions` → `coachFeedback` deltas | TBD | <24h p50 |
| At-risk recovered (30d) | `health` band transitions red→green/amber | — | >30% |
| Renewal rate | `activeStudents` end dates vs re-enrollment | TBD | +10–15 pts |
| Onboarding TTFV | signup → first lesson complete | TBD | <48h |
| Discord weekly active | bot ingest | TBD | 40%+ of members |

---
*Owner of this document: Ops lead. Update ticket status inline; re-baseline targets after OPS-110.*
