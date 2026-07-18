# CMB Operations Scaling Blueprint

> **Rev A · 2026-07-18** · Strategy for scaling the ops team across GHL, Discord, and CMB Lab.
> Detailed ticket-level execution plan: [`SCALING-ROADMAP.md`](./SCALING-ROADMAP.md)

---

## 1. The diagnosis

| Signal | Value | Meaning |
|---|---|---|
| Active paid students | ~2,189 | From GHL active-students export |
| Coaches | 2–3 | ~730:1 student-to-coach ratio |
| GHL lifecycle fields | ~90 | The full student record already exists in GHL |
| Scheduled automations | 2 crons | The automation spine is thin relative to the platform's maturity |

**We do not have a tooling problem. We have a connective-tissue and leverage problem.**

- **GHL** already holds the entire business lifecycle: entitlements (start/end dates, access plan, product line, payment status), coach assignment, a mirror of learning progress, support tickets, NPS, upsell notes, referral tracking.
- **CMB Lab** is a mature LMS (v10, 74 phases): AI grading via n8n, coach review queues, at-risk/drop-off analytics, RBAC webhook enrollment, and a working AI support bot (Lab Assistant) that escalates into GHL tasks.
- **n8n** already orchestrates grading, notifications, and content generation.
- **Discord** is the community layer, minimally wired (a role-grant webhook exists).

The systems talk — but **the ops team is still the manual glue between them**. Every hour a coach spends copying a Fathom link, chasing an inactive student, or writing feedback from scratch is an hour that doesn't scale.

---

## 2. The Leverage Doctrine

Three moves break 730:1. Every project in the roadmap serves one of them. If a proposed build doesn't **deflect**, **amplify**, or **instrument** — it's a distraction.

### Move 1 — Deflect
AI and self-serve absorb volume *before* it reaches a human. Target the ~70% of requests that are answerable, repetitive, or "what should I do next?"
- Lab Assistant (live), Smart Study Engine, knowledge base, Discord FAQ/onboarding bot.

### Move 2 — Amplify
Make each coach operate at 5–10×. Judgment stays human; typing, prep, and admin become AI-drafted and one-click.
- Grading & feedback copilots, auto session-prep briefs, Fathom → notes → GHL closed loop.

### Move 3 — Instrument
Give every student a live health score, then route scarce human attention where it changes outcomes.
- Student Health Score, Ops Command Center, automated retention plays.

### The tiered service model

Volume must be *routed*, not dumped on coaches:

| Tier | ~Share | Channel | Nature |
|---|---|---|---|
| **Tier 0** | ~70% | Lab Assistant, Smart Study, KB, Discord bot | Self-serve AI, instant, 24/7 |
| **Tier 1** | ~20% | Discord peers, community manager, group office hours | Human, one-to-many |
| **Tier 2** | ~10% | Inner Circle / 1:1, escalations | Coach 1:1 — the premium brand, protected |

Routing driven by **Health Score + entitlement tier**: healthy Tier-0 students never need a coach; red-flagged high-value students get proactively pulled up to Tier 2.

---

## 3. Architecture: one stack, three layers

```
L1  SYSTEM OF RECORD (truth)
    GHL  = business lifecycle (entitlements, dates, coach, payment, support, NPS)
    Neon = learning data (progress, SRS, submissions, XP)
    Clerk = auth identity
        │  events
        ▼
L2  ORCHESTRATION (nervous system) — n8n as the single event bus
    enrolled · module.completed · student.inactive · escalation.raised
    renewal.due · health.changed · session.recorded
        │  actions
        ▼
L3  SURFACES (where work & delivery happen — thin, no business logic)
    CMB Lab (learning + coach console + Command Center)
    Discord (community + accountability bot)
    GHL Conversations (email/SMS nurture) · Inbox (support)
```

**Rules of the road**
1. GHL owns the business lifecycle; CMB Lab owns learning data. Neither guesses about the other.
2. All new automation routes through n8n. No new Zapier/Make sprawl.
3. Surfaces stay thin. Business logic lives in L1 schemas and L2 workflows.
4. Every sync respects the existing echo-detection discipline (`src/lib/ghl/echo-detection.ts`).

---

## 4. Automation audit (ground truth from the codebase)

| Operational job | Status | Reality |
|---|---|---|
| Enrollment → account → access | ✅ Automated | `enroll` webhook → Clerk user + role/course grant, idempotent |
| GHL ⇄ tag sync | ✅ Automated | Bidirectional, echo-protected, retry cron; CMB Lab is master tag list |
| Milestone & feedback events → GHL | ✅ Automated | `module/course.completed`, `feedback.sent` drive GHL email workflows |
| Inactive-student detection | 🟡 Partial | Daily cron flags 7-day inactivity; only intervention loop; capped 20/run |
| AI grading / support deflection | 🟡 Partial | AI pre-grades; Lab Assistant deflects; coaches still write all final feedback |
| Auto-tag rules engine | 🔴 Gap | Only `inactive_days` evaluated; `no_progress_days`, `course_completed` in schema but **never implemented** |
| Access / role expiration | 🔴 Gap | Lazy read-time check only; **no expiry cron, no offboarding, no renewal signal** |
| All coaching work | 🔴 Manual | Loom, notes, goals, ratings, Fathom links, thread & pronunciation review — every keystroke human |
| `activeStudents` CRM mirror | 🔴 Fragile | ~90 GHL columns, **no in-repo syncer** — populated by an external process |
| Retention / renewal engine | 🔴 Manual | Analytics reports but **takes no action**; renewals ride on raw end-date fields |
| Webhook retry cron | 🟡 Bug | Documented every-10-min, scheduled **daily** in `vercel.json` — failures can sit ~24h |

---

## 5. The four systems to build

### A · Student Health Score *(Instrument)*
One 0–100 score per student, recomputed nightly from signals already collected: engagement (login recency, XP vs goal), mastery (SRS adherence, practice scores), coaching (submission cadence, session attendance), community (Discord activity), commercial (days-to-renewal, NPS, payment status). Output → green/amber/red tag synced to GHL. Full spec in the roadmap (OPS-201).

### B · Ops Command Center *(Instrument)*
One pane of glass in CMB Lab: today's queues (reviews, escalations, at-risk, renewals), retention radar, renewal pipeline, coach load balancer, deflection & SLA metrics. Turns "where do I even look" into a ranked worklist.

### C · Coach Copilot *(Amplify)*
Coaching is 100% manual today — the highest-leverage AI target. Feedback drafts + Loom talking points (coach edits & sends), auto session-prep briefs, Fathom → summary → coaching notes → GHL loop, feedback QA sampling.

### D · Retention Engine *(Deflect + Instrument)*
Close the loop analytics only reports on: finish the auto-tag rules engine, ship the expiration cron, renewal sequence at T-30/14/7 gated by Health Score, tiered at-risk save play (bot → community → coach).

---

## 6. Discord: from chat room to accountability machine

Extend the existing `discord` webhook seam into a full, entitlement-gated community engine:
- **Two-way role sync** GHL ⇄ Discord (product line & access plan gate channels)
- **Auto-provision & deprovision** on enroll/expire
- **Structured onboarding flow** with completion role — the single biggest week-1 retention lever
- **Accountability bot** — streaks, study-group pomodoros, daily check-ins, SRS-linked vocab drills
- **Milestone celebrations** surfaced from CMB Lab events
- **AI FAQ bot** answering in-channel, escalating to GHL like the Lab Assistant

The loop that matters: **Discord activity feeds the Health Score, and the Health Score drives who the community manager and bot proactively engage.**

---

## 7. Tool stack — keep / add / watch

| Verdict | Tool | Role |
|---|---|---|
| **Keep** | GoHighLevel | System of record. Adopt native Conversation AI / AI Employee (~$97/mo unlimited tier) for SMS/email deflection |
| **Keep** | n8n | Orchestration brain and single event bus; native AI-agent support |
| **Keep** | CMB Lab (+ Clerk, Neon, Mux) | Delivery surface; build Command Center & Copilot in-app |
| **Add** | Fathom (extend) | Transcript → AI summary → coaching notes/GHL pipeline via n8n |
| **Add** | Discord bot stack | PeakBot/CommunityOne-class gamification, StudyTime-style pomodoro, AI FAQ bot |
| **Add** | Notion or Trainual | SOP layer — prerequisite for the first ops hire |
| **Watch** | Metabase (self-host, → Neon) | Only if Command Center reporting outgrows in-app dashboards |
| **Watch** | Dedicated helpdesk (Intercom Fin / eesel) | Only if volume outgrows GHL Conversations + Lab Assistant |

**Anti-sprawl discipline:** every new tool is a new failure mode. Consolidate before adding.

---

## 8. The ops scoreboard

| Metric | Today (est.) | 12-mo target |
|---|---|---|
| Students supported / coach | ~730 | 1,500+ |
| Tier-0 deflection (self-serve resolved) | ≥60% in-scope | 80%+ |
| Feedback turnaround SLA | manual / variable | < 24h |
| At-risk → recovered rate | not tracked | > 30% |
| Renewal / retention rate | not orchestrated | +10–15 pts |
| Coach hours on admin vs teaching | high | cut 50% |
| Time-to-first-value (onboarding) | unmeasured | < 48h |

Baselines captured in H1 (OPS-110) before targets are committed.

---

## 9. Guardrails

1. **Don't automate the relationship away.** We sell a premium human coaching experience. Deflect volume and admin — never the moments that make students feel seen. Tier 2 stays human on purpose.
2. **Fix the fragile mirror first.** `activeStudents` underpins the ops view; make its sync monitored and alerting *before* building the Command Center on it.
3. **AI quality drift.** Human-in-the-loop on anything student-facing. The Lab Assistant's strict allowlist gatekeeping (5 fields, audit-logged) is the template for every new AI surface.
4. **Tool sprawl & sync loops.** Orchestration on n8n only; respect echo-detection; no point solutions that fragment the event bus.

---

*The 730:1 ratio isn't a wall. It's the starting line.*
