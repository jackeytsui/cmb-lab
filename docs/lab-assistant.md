# CMB Lab Assistant (BETA)

AI support chatbot embedded in CMB Lab. Gorgias-style pipeline: **identify → intent scan → guidance → resolve or escalate**. Implements the v0.1 build spec.

## Who sees the widget

Access is tag-driven (no env flag):

- **Admins and coaches** always see the launcher (bottom-right, CMB brand blue, chat icon; light/dark aware).
- **Students** see it when whitelisted: any tag that gives them Course Library access also shows the assistant (one whitelist covers both), or grant the **Lab Assistant (Support Chat)** feature on a tag in **Admin → Tag Management** to show the assistant on its own.

The widget mounts in the dashboard layout, so it appears across the student app (dashboard, lessons, practice).

Requires the existing GHL integration to be configured: at least one active location in **Admin → GHL → Locations**, plus `OPENAI_API_KEY`.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Widget | `src/components/lab-assistant/` | Header (title + BETA badge + session email), 5 FAQ chips pinned at top, footer `mailto:contact@thecmblueprint.com` |
| Chat API | `src/app/api/lab-assistant/route.ts` | Clerk auth → rate limit (15/min) → intent scan → resolve or escalate |
| Intent scan | same route (`gpt-4o-mini`, structured output) | 5 launch intents + `smalltalk`/`other`; confidence < 0.6 → unresolved → escalate |
| Guidance | `ai_prompts` slug `lab-assistant-guidance` | Team-editable in **Admin → AI Prompts**, no code change. Fallback default in `src/lib/lab-assistant/guidance.ts` |
| Data gatekeeper | `src/lib/lab-assistant/student-context.ts` | See below |
| Handover | `src/lib/lab-assistant/escalation.ts` + `src/lib/ghl/tasks.ts` | GHL tasks on the student's contact |
| Admin block | `src/components/admin/LabAssistantAdminWidget.tsx` on **Admin → Manage Portal** | Stats, config health, recent handovers, live test console (`/api/admin/lab-assistant/overview`) |

## Data gatekeeping (non-negotiable)

The model **never** calls GHL. `getStudentContext()` resolves the **signed-in session user** (never identity claims typed in chat, never admin "View As" impersonation), does a **single-record** GHL contact lookup through the existing cached fetch, and injects **allowlisted fields only** into the system prompt:

```
first_name, start_date, end_date, assigned_coach, referral_source, referral_status
```

Everything else is default DENY — no other data is loaded into the request, so cross-student leakage is structurally impossible. Every field fetch and intent scan is audit-logged to `sync_events` (`lab_assistant.*` event types) with field **names and presence only** — values/PII never enter the analytics trail.

### Required GHL field mappings

Values resolve through **Admin → GHL → Field Mappings**. Map these `lmsConcept` keys to your GHL custom field IDs:

`start_date`, `end_date`, `assigned_coach`, `referral_source`, `referral_status`

Unmapped/empty fields degrade to friendly null phrasing (e.g. "no coach assigned yet") plus an escalation offer — internal field names are never exposed.

## Intents (launch scope)

1. **Start date** — student's own start date
2. **End date** — student's own end date
3. **My coach** — name, or null-state phrasing + escalation offer
4. **Referral info** — program explainer + student's own status only
5. **Testimonial w/ Sheldon** — always creates the GHL task `Testimonial interview request`, then confirms

## Handover (escalation = GHL task)

Created on the student's GHL contact:

- Title: `[Lab Bot] Escalation — {intent|unclassified} — {name}`
- Body: full transcript + detected intent + confidence + timestamp
- Due: 24h (4h when urgent signals are detected)
- Bot reply: "passed to the team, reply within 1 business day; urgent → contact@thecmblueprint.com"

Triggered when: intent is `other`/unclassified, confidence is below threshold, the model calls its `escalateToTeam` tool (student asks for a human, accepts an offer, off-scope follow-up), or urgency is detected (task created *and* the inbox is surfaced). Repeat unresolved messages in an already-escalated conversation do not create duplicate tasks.

**Handover always lands in GHL** (like the team's operations form): first choice is a task on the student's own contact; if they have no linked contact — or that call fails — the task is created on a dedicated **CMB Lab Operations** contact instead (upserted automatically; email configurable via `GHL_OPS_CONTACT_EMAIL`, default `contact@thecmblueprint.com`) with the requester's email appended to the title. The audit log records which route was used (`via: student|ops`). Only if both routes fail does the bot point to the support inbox.

## Admin management

Everything sits in one block on **Admin → Manage Portal** ("CMB Lab Assistant", admin-only):

- **Stats (30d)** — chats, in-scope resolution rate (amber below the 60% gate), escalations (with failures), testimonial requests, intent breakdown
- **Config health** — widget access rule, OpenAI key, active GHL location, saved guidance prompt, missing field mappings
- **Recent handovers** — last 5 escalation/testimonial tasks with failure reasons, linking to the full sync log
- **Guidance & actions editor** — edit the bot's instructions (tone, scope, wanted actions/escalation behaviour) directly in the block; saves as a new version of the `lab-assistant-guidance` prompt (created automatically on first save — no seeding needed) and applies on the next message
- **Test console** — chat against the real pipeline in dry-run mode (admin/coach only): intent scan, gatekept context, and guidance all run for real, but no GHL tasks are created and test chats are excluded from resolution metrics. Responses use the signed-in admin's own contact data — the gatekeeper never impersonates a student.

The overview endpoint degrades gracefully: if a stats/health query fails, the block renders the rest and lists the failing section's error inline.

Deeper edits link out: prompt version history in **Admin → AI Prompts**, field mappings in **Admin → GHL Integration**.

## Success gate (P3)

≥60% in-scope resolution, zero data-scope incidents. Resolution/escalation rates are visible in the admin block and queryable from `sync_events` (`lab_assistant.intent_scan` payloads carry `intent`, `confidence`, `resolved`, `urgent`).
