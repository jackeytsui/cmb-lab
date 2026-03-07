# Phase 22: Outbound Webhook Events - Research

**Researched:** 2026-01-31
**Domain:** Event-driven outbound webhooks (LMS milestone events -> GHL CRM)
**Confidence:** HIGH

## Summary

Phase 22 builds the outbound event pipeline: when students hit learning milestones (module complete, course complete, milestone lessons, inactivity), the LMS fires webhook payloads to GoHighLevel so CRM automations can trigger. When coaches send feedback, a webhook also fires. All deliveries must retry with exponential backoff on failure.

The existing codebase provides strong foundations. Phase 21 already built the GHL API client (`src/lib/ghl/client.ts`), contact linking service (`src/lib/ghl/contacts.ts`), echo detection (`src/lib/ghl/echo-detection.ts`), sync event logger (`src/lib/ghl/sync-logger.ts`), and the `sync_events` database table with `retryCount` and `status` columns. The progress tracking system (`src/lib/progress.ts`, `src/app/api/progress/[lessonId]/route.ts`) already detects lesson completion. The certificates service (`src/lib/certificates.ts`) already has `checkCourseCompletion()`. The coach feedback API (`src/app/api/submissions/[submissionId]/feedback/route.ts`) already fires notifications. The analytics route (`src/app/api/admin/analytics/students/route.ts`) already computes days-since-activity per student.

The recommended approach is: (1) build a `WebhookDispatcher` service that writes webhook events to `sync_events` as outbound events, then delivers them via the existing `ghlClient`, (2) hook into existing progress and feedback API routes with fire-and-forget calls, (3) use a Vercel cron job for inactivity detection and retry processing, (4) use the existing `sync_events` table as the retry queue (Postgres-as-queue pattern, already proven in the codebase).

**Primary recommendation:** Use the existing `sync_events` table as both audit log and retry queue. Do NOT add QStash, BullMQ, or any new queue dependency. The Postgres-as-queue pattern is proven for this scale (<1000 students, 50-200 events/day) and the table already has `status`, `retryCount`, and `errorMessage` columns.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `ghlClient` | N/A (in codebase) | Rate-limited HTTP calls to GHL API | Already built in Phase 21, handles 80/10s burst limit via Upstash |
| Existing `sync_events` table | N/A (in DB) | Audit log + retry queue for webhook deliveries | Already has status/retryCount/errorMessage columns, Postgres-as-queue pattern |
| Existing `ghl_contacts` table | N/A (in DB) | Map userId -> ghlContactId for webhook payloads | Contact linking already implemented in Phase 21 |
| Vercel Cron Jobs | N/A (platform) | Trigger inactivity detection + retry processing | Already on Vercel, no new dependency needed |
| `@upstash/redis` | ^1.36.1 | Echo detection markers for outbound changes | Already in package.json and used for rate limiting |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.3.6 | Validate webhook payload shapes before dispatch | Already in codebase, use for type-safe event payload schemas |
| `date-fns` | ^4.1.0 | Calculate inactivity periods and retry delays | Already in codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres-as-queue (sync_events) | QStash (@upstash/qstash) | QStash adds automatic retry + exponential backoff, but adds new dependency + cost; Postgres queue is free and already has the schema |
| Postgres-as-queue | BullMQ + Redis | Overkill for <200 events/day; adds Redis queue management complexity |
| Vercel Cron for retry | Upstash Workflow | More sophisticated but unnecessary at this scale; Vercel cron + Postgres polling is simpler |
| Direct GHL API calls | n8n webhook intermediary | n8n adds latency and complexity; direct GHL calls via existing client are simpler for tag/field operations |

**Installation:**
```bash
# No new packages needed -- all dependencies already exist in the project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/ghl/
│   ├── client.ts              # [EXISTS] Rate-limited GHL API client
│   ├── contacts.ts            # [EXISTS] Contact linking service
│   ├── echo-detection.ts      # [EXISTS] Echo detection for webhook loops
│   ├── sync-logger.ts         # [EXISTS] Sync event logging
│   ├── webhooks.ts            # [NEW] WebhookDispatcher - builds payloads, queues deliveries
│   └── milestones.ts          # [NEW] MilestoneDetector - detects completion events
├── app/api/
│   ├── cron/
│   │   └── ghl-webhooks/
│   │       └── route.ts       # [NEW] Vercel cron: retry failed events + detect inactive students
│   └── progress/
│       └── [lessonId]/
│           └── route.ts       # [MODIFY] Add fire-and-forget milestone detection after progress update
```

### Pattern 1: Fire-and-Forget Event Dispatch
**What:** After a user action completes (lesson progress, coach feedback), dispatch a webhook event asynchronously without blocking the user response.
**When to use:** Every outbound webhook trigger point (progress update, feedback submission).
**Example:**
```typescript
// In the progress API route, AFTER returning response to user:
// (pattern already used in feedback route for notifications)

// 1. Check if this progress update triggered a milestone
// 2. If yes, write sync_event with status='pending'
// 3. Attempt immediate delivery
// 4. If delivery fails, leave as 'pending' for cron retry

export async function dispatchWebhook(event: WebhookEvent): Promise<void> {
  const eventId = await logSyncEvent({
    eventType: event.type,
    direction: "outbound",
    entityType: event.entityType,
    entityId: event.entityId,
    ghlContactId: event.ghlContactId,
    payload: event.payload,
    status: "pending",
  });

  try {
    await deliverWebhook(event);
    await markEventCompleted(eventId);
  } catch (error) {
    await markEventFailed(eventId, error instanceof Error ? error.message : "Unknown error");
  }
}
```

### Pattern 2: Module/Course Completion Detection
**What:** After a lesson is marked complete, check if all lessons in the module (and all modules in the course) are now complete. This piggybacks on the existing `checkLessonCompletion()` and `checkCourseCompletion()` logic.
**When to use:** Every time `POST /api/progress/[lessonId]` marks a lesson complete (`lessonComplete = true` in response).
**Example:**
```typescript
// After lesson completion is detected in progress route:
if (lessonComplete) {
  // Fire-and-forget: don't await, don't block response
  detectAndDispatchMilestones(user.id, lessonId).catch(console.error);
}

async function detectAndDispatchMilestones(userId: string, lessonId: string) {
  // 1. Look up which module this lesson belongs to
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: { module: { with: { course: true } } },
  });

  // 2. Check module completion (all lessons in module completed?)
  const moduleComplete = await checkModuleCompletion(userId, lesson.module.id);
  if (moduleComplete) {
    await dispatchWebhook({
      type: "module.completed",
      entityType: "module",
      entityId: lesson.module.id,
      // ... payload with student email, module title, course title
    });
  }

  // 3. Check course completion (all modules completed?)
  const courseComplete = await checkCourseCompletion(userId, lesson.module.course.id);
  if (courseComplete) {
    await dispatchWebhook({
      type: "course.completed",
      entityType: "course",
      entityId: lesson.module.course.id,
      // ... payload with student email, course title
    });
  }
}
```

### Pattern 3: Cron-Based Retry with Exponential Backoff
**What:** A Vercel cron job runs periodically (every 10 minutes), picks up failed/pending events from `sync_events`, and retries with exponential backoff.
**When to use:** For all failed webhook deliveries and for inactivity detection.
**Example:**
```typescript
// app/api/cron/ghl-webhooks/route.ts
export async function GET(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 1. Retry failed events (exponential backoff)
  const failedEvents = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.direction, "outbound"),
        eq(syncEvents.status, "failed"),
        lt(syncEvents.retryCount, 5) // Max 5 retries
      )
    );

  for (const event of failedEvents) {
    // Exponential backoff: 1min, 4min, 16min, 64min, 256min
    const backoffMs = Math.pow(4, event.retryCount) * 60_000;
    const retryAfter = new Date(event.createdAt.getTime() + backoffMs);
    if (new Date() < retryAfter) continue; // Not ready yet

    try {
      await deliverWebhookFromEvent(event);
      await markEventCompleted(event.id);
    } catch (error) {
      await markEventFailed(event.id, error.message);
    }
  }

  // 2. Detect inactive students (only run once daily via separate cron)
  // ...

  return new Response("OK");
}
```

### Pattern 4: Vercel Cron Configuration
**What:** Configure `vercel.json` for scheduled webhook retry and inactivity detection.
**When to use:** Two cron jobs needed -- frequent retry (every 10 min) and daily inactivity check.
**Example:**
```json
{
  "crons": [
    {
      "path": "/api/cron/ghl-webhooks",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/ghl-inactive",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### Anti-Patterns to Avoid
- **Blocking the user response to wait for GHL delivery:** The feedback and progress routes must return immediately. Webhook dispatch is fire-and-forget. The existing feedback route already follows this pattern (lines 127-144 of the feedback route do fire-and-forget notification).
- **Retrying in the same request context:** Serverless functions have limited duration. Write the event to `sync_events` and let the cron job handle retries.
- **Sending webhooks without checking contact linking first:** Always verify the user has a `ghlContactId` before attempting to dispatch. Skip silently if not linked (not all LMS users will be GHL contacts).
- **Computing module completion on every progress update:** Only check module/course completion when a lesson is newly completed (`lessonComplete = true`), not on every video percentage update.
- **Using `node-cron` or similar scheduler libraries:** These require long-running processes and don't work in Vercel's serverless model. Use Vercel Cron Jobs instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limited GHL API calls | Custom rate limiter | Existing `ghlClient` + `ghlBurstLimiter` | Already handles 80/10s sliding window, 429 retry, rate limit header tracking |
| Retry queue | Redis queue, BullMQ | Existing `sync_events` Postgres table | Already has status, retryCount, errorMessage columns; polling via cron is sufficient at <200 events/day |
| Contact ID resolution | Email-based lookup on every webhook | Existing `findOrLinkContact()` / `getGhlContactId()` | Persistent mapping survives email changes |
| Echo detection | Custom change tracking | Existing `markOutboundChange()` / `isEchoWebhook()` | Redis TTL markers already implemented |
| Course completion check | Custom SQL queries | Existing `checkCourseCompletion()` in `src/lib/certificates.ts` | Already handles module/lesson hierarchy with soft-delete awareness |
| Exponential backoff calculation | Custom math | `Math.pow(4, retryCount) * 60_000` | Simple formula: ~1m, 4m, 16m, 64m, 256m delays (5 retries cover ~5.5 hours) |

**Key insight:** Phase 21 built the heavy infrastructure. Phase 22 is primarily about connecting existing services (progress tracking, contact linking, sync logging) with new dispatch logic and cron-based processing. The amount of genuinely new code is small.

## Common Pitfalls

### Pitfall 1: Module Completion Detection Requires New Logic
**What goes wrong:** The codebase has `checkCourseCompletion()` (all lessons in all modules complete) but NO `checkModuleCompletion()` (all lessons in ONE module complete). GHLWH-01 requires detecting module completion separately from course completion.
**Why it happens:** The LMS tracks progress at lesson level. Module completion is derived, not stored. No one needed to check "did the student finish all lessons in module X?" before.
**How to avoid:** Build `checkModuleCompletion(userId, moduleId)` modeled after `checkCourseCompletion()` -- query all non-deleted lessons in the module, count completed ones, compare.
**Warning signs:** Module completion webhooks never fire even though individual lessons are being completed.

### Pitfall 2: Milestone Lessons Have No Schema Marker
**What goes wrong:** GHLWH-04 requires webhooks when students complete "specific milestone lessons." But the `lessons` table has no `isMilestone` flag or similar marker. There's no way to distinguish milestone lessons from regular lessons.
**Why it happens:** The LMS was built for linear progression, not milestone-based tracking.
**How to avoid:** Two options: (A) Add a boolean `isMilestone` column to the `lessons` table, or (B) use the existing `ghl_field_mappings` table to map lesson IDs to milestone webhook triggers (admin-configurable). Option B is more flexible and doesn't require a schema migration.
**Warning signs:** No way to configure which lessons are milestones without code changes.

### Pitfall 3: Inactivity Detection Has No Cron Infrastructure
**What goes wrong:** GHLWH-03 requires detecting students inactive for 7+ days. The analytics route (`/api/admin/analytics/students`) already computes `daysSinceActivity`, but it's a read-only analytics endpoint. There's no scheduled job to scan for inactive students and fire webhooks.
**Why it happens:** The existing inactivity query was built for dashboard display, not automated event triggering.
**How to avoid:** Build a Vercel cron job that runs the same inactivity query daily, filters for students crossing the 7-day threshold, and dispatches webhooks. Must track which students already had their inactivity webhook sent to avoid duplicate daily firings.
**Warning signs:** Inactivity webhooks fire every day for the same student instead of once.

### Pitfall 4: Duplicate Webhook Deliveries
**What goes wrong:** A student completes the last lesson in a module AND the last module in a course simultaneously. Both module.completed and course.completed webhooks fire, plus potentially lesson.completed if it's a milestone lesson. If the completion is detected twice (e.g., race condition with multiple progress updates), duplicate webhooks are sent.
**Why it happens:** The progress API can receive rapid sequential calls (video reaches 95%, interaction passes simultaneously). Each call independently checks milestone status.
**How to avoid:** Use idempotency keys based on `(userId, eventType, entityId)` -- check `sync_events` for recent matching completed events before dispatching. The `sync_events` table already has these fields, so a simple "check before insert" query prevents duplicates.
**Warning signs:** GHL automations fire twice for the same student milestone.

### Pitfall 5: GHL Contact Not Linked
**What goes wrong:** A milestone event fires but the student has no `ghlContactId` in the `ghl_contacts` table. The webhook dispatcher crashes or silently drops the event.
**Why it happens:** Not all LMS users have been linked to GHL contacts. Contact linking depends on matching email in GHL, which may not exist for all students.
**How to avoid:** In the dispatcher, check for `ghlContactId` first. If not found, attempt `findOrLinkContact()`. If that throws (no matching GHL contact), log a sync event with status "skipped" and a descriptive message. Do NOT fail the entire operation.
**Warning signs:** Sync events table shows many "skipped" events for unlinked contacts.

### Pitfall 6: Vercel Cron Max Duration
**What goes wrong:** The cron job tries to retry too many failed events in one invocation and times out (Vercel serverless function default: 10s, max: 60s on Pro plan).
**Why it happens:** If many events fail simultaneously (e.g., GHL is down for an hour), the retry job has 100+ events to process.
**How to avoid:** Limit the cron job to processing N events per invocation (e.g., 10). Set `maxDuration` in the route config. Process oldest first (FIFO). The remaining events will be picked up in the next cron run (10 minutes later).
**Warning signs:** Cron job returning 504 timeout errors in Vercel dashboard.

## Code Examples

### Webhook Payload Schema (all events)
```typescript
// Source: Derived from codebase analysis + GHLWH-06 requirement
// All webhook payloads include: student email, event type, relevant context

interface WebhookPayload {
  eventType: "module.completed" | "course.completed" | "lesson.milestone" | "student.inactive" | "feedback.sent";
  timestamp: string; // ISO 8601
  student: {
    email: string;
    name: string | null;
    userId: string;
    ghlContactId: string;
  };
  context: Record<string, unknown>; // Event-specific data
}

// Module completed context
interface ModuleCompletedContext {
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
  totalLessonsInModule: number;
}

// Course completed context
interface CourseCompletedContext {
  courseId: string;
  courseTitle: string;
  totalModules: number;
  totalLessons: number;
  completionDate: string; // ISO 8601
}

// Student inactive context
interface StudentInactiveContext {
  daysSinceActivity: number;
  lastActivityDate: string | null; // ISO 8601
  totalLessonsCompleted: number;
  lastLessonTitle: string | null;
}

// Coach feedback context
interface FeedbackSentContext {
  submissionId: string;
  lessonId: string;
  lessonTitle: string;
  coachName: string;
  hasLoomUrl: boolean;
  hasFeedbackText: boolean;
}
```

### Module Completion Check (new function needed)
```typescript
// Source: Modeled after checkCourseCompletion() in src/lib/certificates.ts
export async function checkModuleCompletion(
  userId: string,
  moduleId: string
): Promise<boolean> {
  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.moduleId, moduleId),
        isNull(lessons.deletedAt)
      )
    );

  if (allLessons.length === 0) return false;

  const completedLessons = await db
    .select({ id: lessonProgress.lessonId })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessons.moduleId, moduleId),
        isNull(lessons.deletedAt),
        isNotNull(lessonProgress.completedAt)
      )
    );

  return completedLessons.length >= allLessons.length;
}
```

### GHL Tag Addition via Existing Client
```typescript
// Source: GHL API docs - POST /contacts/:contactId/tags
// Uses existing ghlClient which handles rate limiting and retry
import { ghlClient } from "@/lib/ghl/client";
import { markOutboundChange } from "@/lib/ghl/echo-detection";

async function addTagToContact(ghlContactId: string, tagName: string): Promise<void> {
  // Mark outbound change for echo detection BEFORE making the API call
  await markOutboundChange(ghlContactId, "tag", tagName);

  await ghlClient.post(`/contacts/${ghlContactId}/tags`, {
    tags: [tagName],
  });
}
```

### Vercel Cron Route with CRON_SECRET Auth
```typescript
// Source: Vercel docs - https://vercel.com/docs/cron-jobs
// app/api/cron/ghl-webhooks/route.ts
import { NextRequest } from "next/server";

export const maxDuration = 60; // Pro plan: 60s max

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Process up to 10 failed events per run
  const BATCH_SIZE = 10;

  const failedEvents = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.direction, "outbound"),
        eq(syncEvents.status, "failed"),
        sql`${syncEvents.retryCount} < 5`
      )
    )
    .orderBy(syncEvents.createdAt)
    .limit(BATCH_SIZE);

  let retried = 0;
  let succeeded = 0;

  for (const event of failedEvents) {
    // Exponential backoff: skip if not ready
    const backoffMs = Math.pow(4, event.retryCount) * 60_000;
    const retryAfter = new Date(event.createdAt.getTime() + backoffMs);
    if (new Date() < retryAfter) continue;

    retried++;
    try {
      await deliverWebhookFromEvent(event);
      await markEventCompleted(event.id);
      succeeded++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await markEventFailed(event.id, msg);
    }
  }

  return Response.json({ retried, succeeded, pending: failedEvents.length });
}
```

### Inactivity Detection Deduplication
```typescript
// Track which students already had their inactivity webhook sent
// Use sync_events table: check for recent "student.inactive" event for this user
async function hasRecentInactivityEvent(userId: string): Promise<boolean> {
  const recent = await db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.eventType, "student.inactive"),
        eq(syncEvents.entityId, userId),
        eq(syncEvents.direction, "outbound"),
        // Only consider events from the last 7 days to allow re-notification
        // if student becomes active and then inactive again
        sql`${syncEvents.createdAt} > NOW() - INTERVAL '7 days'`
      )
    )
    .limit(1);

  return recent.length > 0;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GHL API V1 | GHL API V2 only | Jan 2026 (V1 end of support) | Must use V2 endpoints; V1 won't receive support |
| GHL OAuth flow | Private Integration Token (PIT) | Already decided Phase 21 | Simpler auth, no token refresh race conditions |
| Redis/BullMQ queues | Postgres-as-queue for <10K events/day | Industry shift for small scale | Fewer moving parts; Postgres is reliable enough |
| `node-cron` for scheduling | Vercel Cron Jobs | Serverless adoption | Cron libraries require persistent process; Vercel cron is HTTP-triggered |

**Deprecated/outdated:**
- GHL API V1: End of support Jan 2026. All endpoints must use V2 paths.
- `@gohighlevel/api-client` SDK: Prior decision in Phase 21 was to NOT use it (use native `fetch()` via `ghlClient` instead). This remains correct.

## Open Questions

1. **Milestone Lesson Identification Mechanism**
   - What we know: GHLWH-04 requires webhooks for "specific milestone lessons." The `lessons` table has no milestone flag.
   - What's unclear: Should milestone lessons be marked with a DB column, or configured via the existing `ghl_field_mappings` admin table?
   - Recommendation: Use the `ghl_field_mappings` table with `lmsConcept = 'milestone_lesson:{lessonId}'` entries. This is admin-configurable without schema migration. If the team prefers a simpler approach, add `isMilestone boolean default false` to the lessons table (requires migration).

2. **Webhook Delivery Target: Direct GHL API vs GHL Incoming Webhook URL**
   - What we know: GHL contacts have tag endpoints (`POST /contacts/:contactId/tags`). GHL also supports incoming webhook URLs for workflow triggers.
   - What's unclear: Should the LMS call GHL's tag API directly (add milestone tags), OR send payloads to a GHL incoming webhook URL (triggers a GHL workflow)?
   - Recommendation: Use BOTH. Add tags via the direct API (uses existing `ghlClient`). Also support an optional `GHL_WEBHOOK_URL` env var for firing payloads to a GHL incoming webhook (enables GHL workflow automations). The tag API is the primary mechanism; the incoming webhook is supplementary.

3. **Inactivity Threshold Configurability**
   - What we know: Success criteria specifies 7+ days. The analytics route already defaults to 7 days.
   - What's unclear: Should the threshold be configurable (e.g., admin setting) or hardcoded?
   - Recommendation: Start hardcoded at 7 days. Add to admin GHL settings page later if needed. Premature configurability adds complexity.

4. **Vercel Plan Limitations**
   - What we know: Hobby plan has 1 cron job max, Pro plan has more. Cron frequency limited to once per day on Hobby.
   - What's unclear: Which Vercel plan is the project on?
   - Recommendation: Design for Pro plan (multiple crons, 60s max duration, per-10-minute scheduling). If on Hobby, collapse retry + inactivity into a single daily cron job.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** (verified by reading actual source files):
  - `src/lib/ghl/client.ts` - GHL API client with rate limiting and retry
  - `src/lib/ghl/contacts.ts` - Contact linking service
  - `src/lib/ghl/echo-detection.ts` - Redis-based echo detection
  - `src/lib/ghl/sync-logger.ts` - Sync event logging with status/retryCount
  - `src/db/schema/ghl.ts` - Database tables: ghl_contacts, sync_events, ghl_field_mappings
  - `src/app/api/progress/[lessonId]/route.ts` - Progress tracking API (integration point)
  - `src/app/api/submissions/[submissionId]/feedback/route.ts` - Coach feedback API (integration point)
  - `src/lib/certificates.ts` - `checkCourseCompletion()` function
  - `src/app/api/admin/analytics/students/route.ts` - Inactivity calculation query
  - `src/lib/rate-limit.ts` - Existing rate limiters including ghlBurstLimiter
- [GHL Add Tags API](https://marketplace.gohighlevel.com/docs/ghl/contacts/add-tags/index.html) - `POST /contacts/:contactId/tags`
- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs) - Configuration, security, limitations
- [QStash Documentation](https://upstash.com/docs/qstash/overall/llms-txt) - Retry with exponential backoff (Context7 /websites/upstash-qstash)

### Secondary (MEDIUM confidence)
- [Upstash Blog: Webhook + QStash](https://upstash.com/blog/webhook-qstash) - QStash as webhook retry intermediary (not recommended for this use case but validated as alternative)
- [Svix: Webhook Retry Best Practices](https://www.svix.com/resources/webhook-best-practices/retries/) - Exponential backoff patterns, idempotency keys

### Tertiary (LOW confidence)
- [Latenode: Webhook Retry Logic](https://latenode.com/blog/integration-api-management/webhook-setup-configuration/how-to-implement-webhook-retry-logic) - General retry patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already exist in codebase; no new dependencies needed
- Architecture: HIGH - Patterns directly modeled after existing codebase (fire-and-forget notifications, sync_events logging, cron for background processing)
- Pitfalls: HIGH - Identified from actual codebase gaps (no checkModuleCompletion, no milestone flag, no cron infrastructure) verified by reading source files

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (stable -- no fast-moving dependencies)
