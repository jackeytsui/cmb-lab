# Success Command Center — a scalable, AI‑native Customer Success platform

> Goal: build the best, most scalable CSM tool to keep every business, customer,
> and student engaged, healthy, and successful — and to make the people running
> success (coaches / CSMs) dramatically more effective.

This document is both the **strategy** (a review of the CSM tech landscape and
what's worth stealing) and the **build spec** (the architecture, data model, and
scoring engine now shipped in this repo). A working foundation is already
implemented — see [What's shipped](#whats-shipped-in-this-pr).

---

## 1. The core insight: this product is a hybrid

Most tools pick one of two worlds:

- **B2B CSM platforms** (Gainsight, ChurnZero, Vitally, Totango/Catalyst,
  Planhat, Custify, ClientSuccess) manage **accounts** — a business, a cohort —
  with a human CSM in the loop running playbooks.
- **Student‑success platforms** (Civitas, EAB Navigate, Salesforce Education
  Cloud) manage **individuals** at scale, mostly through automated early‑warning
  models and nudges.

CantoMando is **both at once**: a coach owns a *book of business* (B2B workflow
discipline), and the churning/succeeding unit is an *individual student* (EdTech
early‑warning + nudge engine). The winning design **fuses** the two:

> Individual‑grain early‑warning + automated nudges **first**, escalating to a
> human coach playbook **only when the automation fails**. That tiered
> "automate‑first, escalate‑on‑failure" model is how you push the
> student‑to‑coach ratio from ~1:50 toward 1:500+ without lowering the quality
> of care.

That fusion is the differentiator. No incumbent does both grains natively.

---

## 2. Market review — what the best tools do, and the one idea to steal from each

| Platform | Signature capability worth stealing |
|---|---|
| **Gainsight** | **The CTA / "action object"** — every risk/opportunity/lifecycle signal becomes a *first‑class, assignable work item* with a reason code and outcome logging. Signals become accountable work, not dashboards. |
| **ChurnZero** | **In‑app WalkThroughs + Success Centers** — reach users *inside the product* (guided tours, resource hubs, nudges) with no engineering. Directly applicable to nudging students inside the LMS. |
| **Vitally** | **Customer‑facing "Docs" portals** — live, shared success plans between CSM and customer. Steal as a coach↔student (or coach↔B2B‑admin) collaborative space. |
| **Totango/Catalyst** | **SuccessBLOCs** — composable, reusable playbook "blocks" you assemble like Lego instead of building from scratch. |
| **Planhat** | **Data‑model‑first automation** — trigger playbooks off *calculated* metrics. Perfect for education where "success" is a custom formula (lessons, streak, proficiency gain). |
| **Custify** | **Calculated‑metric triggers + AI‑generated playbooks** — non‑technical CSMs define a metric and auto‑draft the play. Automation‑first for scale. |
| **HubSpot Service** | **Unified CRM+service+CS data model** — no lossy sync. The anti‑silo argument. |
| **ClientSuccess** | **Pulse™ sentiment** — a qualitative "read" tracked *separately* from usage. Model sentiment as its own signal. |
| **Civitas (EdTech)** | **Initiative analysis** — measure the *causal impact* of each intervention ("did the nudge/coaching actually lift persistence?"), and feed it back into the model. |
| **EAB Navigate (EdTech)** | **Contextual early alerts** — every alert carries the *full picture* (engagement, grades, prior alerts, notes) on one screen. |
| **Salesforce Agentforce (EdTech)** | **AI student summary + best‑fit resource** on every advisor touch — scale personalized support without adding headcount. |
| **Customer.io / Intercom** | **Event‑driven lifecycle messaging** — precise, well‑timed nudges keyed to granular product events ("finished Lesson 3, idle 5 days"). |

**Cross‑cutting truth (2025–2026):** every major platform now ships an AI
copilot — so AI is table stakes. Differentiation has moved to **autonomy**: does
the tool *act* (draft the nudge, queue the task, take the tech‑touch step) or
just *show a dashboard a human must interpret*? The frontier is
**autonomous‑with‑approval**.

### Where incumbents fall short (our openings)

1. **Silos & lossy sync** — sales owns CRM, support owns tickets, product owns
   usage; the AI only ever sees fragments, so scores computed on fragments are
   wrong.
2. **Dashboards, not execution** — the interpretation + action burden still
   lands on the CSM.
3. **Dirty data** — tools built for *configuration* (not the CSM's workflow) get
   neglected; scores decay to garbage.
4. **Dead metrics** — NPS is effectively dead (non‑responders are the churners);
   usage‑only "activity scores" predict churn at only ~55–65% vs ~78–85% for
   **multimodal** signals that include *what customers actually say*.
5. **Product‑led blindness** — incumbents were built for white‑glove enterprise;
   they're weak where accounts self‑serve then expand — exactly our motion.
6. **Slow & expensive** — 3–6 month implementations, $80K+/yr.

### The lesson from the fastest AI companies (Lovable, Harvey, Assembly)

They **killed NPS and activity scores** for outcome signals (time‑to‑first‑value
as a hard unit, velocity), and **moved the "win" from signature to
implementation success** — dropping monthly churn from ~4% → ~0.5%. *The renewal
is won during onboarding/first‑value, not at renewal time.* Our health model
treats onboarding completion as a gating factor for exactly this reason.

---

## 3. Health scoring — the model we built

Best practice, distilled and implemented in
[`src/lib/csm/scoring.ts`](../src/lib/csm/scoring.ts):

- **Few, high‑signal factors (6)**, not dozens of noisy inputs.
- **A weighted linear composite:** `score = Σ(factor_score × weight)`.
- **Aggressive time‑decay on engagement** — `100 × 0.5^(daysSince / 7)`, so ~7
  days of silence *halves* the recency subscore. Inactivity is the earliest
  churn signal, so it must bite fast.
- **Relative velocity** — this‑period vs last‑period lesson completion, so a
  power user who suddenly slows down is caught *even while still "active"* (the
  gap absolute scores miss).
- **Not‑applicable factors are excluded and their weight redistributed** — a
  student with no assigned coach isn't punished for missing coaching data; the
  composite always renormalises to a full 0–100.
- **Every subscore is explainable** — each factor ships a plain‑language reason,
  so the UI can always answer "why is this student red?".
- **Bands:** thriving 80–100 · healthy 60–79 · watch 40–59 · at‑risk 20–39 ·
  critical 0–19. Tuned so the majority of a healthy cohort lands green and the
  worklist surfaces the risky minority.

### The six factors and default weights

| Factor | Weight | Signal source (this codebase) |
|---|---|---|
| **Engagement recency** | 0.30 | `lesson_progress.last_accessed_at`, `feature_engagement_events` (7‑day half‑life) |
| **Progress velocity** | 0.20 | `lesson_progress.completed_at` — lessons in last 30d vs prior 30d |
| **Consistency & habit** | 0.15 | `daily_activity` active days (last 14) + current streak |
| **Commercial & onboarding** | 0.15 | GHL `active_students.payment_status`, `product_end_date`, first‑lesson gate |
| **Coaching cadence** | 0.10 | `coaching_sessions` recency (30‑day half‑life) *(N/A if no coach)* |
| **Satisfaction** | 0.10 | `coaching_session_ratings` + CRM service‑quality *(N/A if no data)* |

**Churn risk** is the inverse of health, amplified by acute red flags (failed
payment +15, >21 days inactive +10, onboarding incomplete +5).

### Why three models, not one (roadmap)

Mature scoring splits into focused models with different weights and different
plays. The engine is structured to grow into:

1. **Churn‑risk** — will this student lapse? *(shipped)*
2. **Expansion‑readiness** — ready to upgrade / refer? *(signal shipped:
   `expansion_signal`, `champion`)*
3. **Outcome / value** — is the student actually getting fluent? *(next: fold in
   assessment/HSK gains and proficiency deltas)*

**Predictive upgrade path:** the append‑only `customer_health_scores` ledger is
the training set. Once enough churned‑student history accumulates, derive the
weights from *what churned students did 3–6 months before lapsing* instead of the
hand‑tuned defaults — and always show coaches the evidence behind each weight.

---

## 4. Signals, playbooks & next‑best‑actions

The CTA/action‑object pattern, implemented:

- **Signal engine** ([`signals.ts`](../src/lib/csm/signals.ts)) turns the score +
  raw inputs into discrete, workable signals — `onboarding_stall`, `inactivity`,
  `stalled_progress`, `low_satisfaction`, `coaching_gap`, `streak_broken`,
  `payment_risk`, `renewal_upcoming`, `expansion_signal`, `champion`. Each has a
  **stable `dedupeKey`** so an ongoing condition is *refreshed*, not duplicated,
  every run.
- **Next‑best‑action engine** ([`playbooks.ts`](../src/lib/csm/playbooks.ts))
  maps each signal to a concrete, prioritised action, sorted so the most urgent
  action surfaces first. This is the deterministic scaffold an **AI copilot**
  later fills with personalised copy.
- **Config‑as‑data playbooks** — `csm_playbooks` stores triggers + step lists as
  JSON, so success ops author automations ("when inactivity ≥ 14d → nudge, wait
  72h, escalate to coach") **without a deploy**. A seed catalogue
  (`DEFAULT_PLAYBOOKS`) ships working plays: Onboarding Rescue, Re‑Engagement,
  Billing Recovery, Renewal Prep, Expansion.

The **tiered escalation** pattern is baked into the seed plays: an automated
nudge fires first; a coach task is created only on a branch condition
("still_inactive"). Never auto‑blast without a human‑approval step on
AI‑generated messages.

---

## 5. Architecture — scalable and multi‑tenant by design

```
        ┌─────────────────────────────────────────────────────────┐
        │  Signals (source‑agnostic CustomerSignals struct)        │
        │  LMS: lesson_progress · engagement_events · daily_activity│
        │  CRM: active_students (GHL) · coaching_sessions/ratings   │
        └───────────────┬─────────────────────────────────────────┘
                        │  loaders (health.ts) — one batched pass, no N+1
                        ▼
        ┌─────────────────────────────┐   PURE, unit‑tested
        │  scoring.ts → HealthResult  │   (score · band · trend · churn · factors)
        └───────────────┬─────────────┘
                        ▼
        ┌───────────────┴───────────────┐
        │  signals.ts → DerivedSignal[] │  playbooks.ts → NextBestAction[]
        └───────────────┬───────────────┘
                        ▼  persist (index.ts)
   csm_accounts (360 anchor) · customer_health_scores (ledger) ·
   csm_signals (deduped) · csm_playbooks/runs · csm_tasks · csm_activities
                        ▼
        ┌─────────────────────────────┐
        │  API: /api/admin/csm/*      │→ Success Command Center UI
        └─────────────────────────────┘
```

**Design principles:**

- **Pure engine, IO at the edges** — `scoring.ts` has no DB and no `server-only`,
  so it's trivially testable and reusable for students, B2B seats, or partner
  businesses. Loaders sit in `health.ts`.
- **Multi‑tenant ready** — every row is scoped by `user_id` and an optional
  `account_ref`, so students, seat blocks, or whole businesses roll up with **no
  schema change**.
- **Append‑only where trend matters** — health scores and activities are never
  overwritten, giving history for charts and future churn models.
- **Config‑as‑data** — playbooks are rows, not code.
- **Batched reads** — the book of business is assessed in one grouped‑query pass
  (mirrors the existing `analytics/overview` pattern), so it scales to the whole
  cohort without per‑student queries.

### Scaling to thousands / many businesses

- **Recompute as a scheduled job** — the `POST /api/admin/csm/book` recompute is
  the unit of work; run it on a cron / queue rather than on request. For very
  large cohorts, shard by `account_ref` or `owner_id` and process in batches.
- **Warehouse‑native path (future)** — the highest‑scale version pushes events
  (Segment/PostHog) → warehouse (Snowflake/BigQuery) → dbt models → scores →
  reverse‑ETL back into `csm_*` tables. The current Postgres design is the
  same shape at a smaller scale; the `CustomerSignals` boundary means the scorer
  never changes when the data source does.

---

## 6. What's shipped in this PR

A working, tested foundation — not just a design.

**Data model** — [`src/db/schema/csm.ts`](../src/db/schema/csm.ts) +
migration `0068_csm_platform.sql` (idempotent):
`csm_accounts`, `customer_health_scores`, `csm_signals`, `csm_playbooks`,
`csm_playbook_runs`, `csm_tasks`, `csm_activities`.

**Engine** — [`src/lib/csm/`](../src/lib/csm/):
- `scoring.ts` — pure multi‑factor health model (6 factors, time‑decay,
  relative velocity, weight redistribution, explainable factors, churn risk).
- `health.ts` — batched LMS + CRM signal loaders.
- `signals.ts` — 11 risk/opportunity signal types with stable dedupe keys.
- `playbooks.ts` — next‑best‑action recommender + seed playbook catalogue.
- `index.ts` — orchestration (`getBookOfBusiness`, `assessCustomer`,
  `persistAssessments`, `resolveStaleSignals`).
- 11 unit tests in `src/lib/__tests__/csm-health.test.ts` (all green).

**API** — `src/app/api/admin/csm/`:
- `GET /api/admin/csm/book` — assessed book of business + portfolio summary.
- `POST /api/admin/csm/book` — recompute + snapshot (admin only).
- `GET /api/admin/csm/customer/[userId]` — Customer 360 (live assessment +
  health history + signal history + timeline).

**UI** — `src/app/(dashboard)/admin/csm/` — the **Success Command Center**:
portfolio KPIs, a health‑distribution bar, band filters, and an at‑risk worklist
sorted worst‑first with an expandable per‑customer panel (health contributors,
signals, next‑best‑actions). Linked from the Admin Manage portal (coach‑visible).

Everything typechecks, lints, builds, and is unit‑tested.

---

## 7. Roadmap — from foundation to "magic"

**Now → next (highest leverage):**

1. **Scheduled recompute + signal‑driven task creation** — cron the recompute;
   auto‑open `csm_tasks` from new high‑severity signals so the worklist is live.
2. **Playbook runtime** — an executor that walks `csm_playbooks.steps`
   (send_email → wait → branch → create_task → notify_owner) with the
   `csm_playbook_runs` ledger. Wire `send_email`/nudges through the existing n8n
   + GHL integration (the "in‑app / in‑LMS engagement layer").
3. **Outcome model** — fold assessment/HSK proficiency gains into a third score
   so "is the student actually getting fluent?" is first‑class.

**Then (the AI‑native leap):**

4. **AI copilot** (OpenAI, already in the stack) — per‑student **auto‑summaries**,
   plain‑language **risk narratives**, and **auto‑drafted, personalised outreach**
   with human approve/edit before send. The deterministic next‑best‑action
   engine is the scaffold; the copilot writes the words.
5. **Autonomous‑with‑approval** tech‑touch tier — the system drafts + queues,
   the coach approves; low‑risk nudges auto‑send.
6. **Closed‑loop intervention measurement** (Civitas‑style) — attribute
   persistence/renewal lift to specific nudges/playbooks and feed the causal
   evidence back into the weights.
7. **Coach↔student shared success portal** (Vitally‑style Docs) and
   **composable playbook blocks** (Totango‑style) for non‑technical authoring.

**Steal‑worthy capabilities checklist** (tracked against the roadmap):

- [x] First‑class action objects (signals → prioritised actions)
- [x] Multi‑factor health with time‑decay + relative‑to‑baseline velocity
- [x] Explainable factors ("why is this red?")
- [x] Config‑as‑data playbooks + seed catalogue
- [x] Onboarding/first‑value as a gating health factor
- [x] Expansion & champion (opportunity, not just risk) signals
- [x] Append‑only ledger as future churn‑model training data
- [ ] Event‑driven nudges delivered in‑app / via n8n+GHL
- [ ] Tiered automate‑first, escalate‑on‑failure runtime
- [ ] Three separate models (churn / expansion / outcome)
- [ ] AI copilot: summaries, risk narratives, drafted outreach
- [ ] Closed‑loop intervention impact measurement
- [ ] Coach↔customer shared success portal

---

*Sources informing this design include Gainsight, ChurnZero, Vitally,
Totango/Catalyst, Planhat, Custify, HubSpot, ClientSuccess, Civitas Learning,
EAB Navigate, Salesforce Education Cloud/Agentforce, Customer.io, Intercom,
PostHog/Segment, and published EdTech early‑warning/nudge research, plus the
public post‑mortems of how Lovable, Harvey, and Assembly AI rebuilt customer
success. Vendor pricing and impact percentages are directional.*
