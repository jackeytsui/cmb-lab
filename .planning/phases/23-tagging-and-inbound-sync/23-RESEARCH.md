# Phase 23: Tagging & Inbound Sync - Research

**Researched:** 2026-01-31
**Domain:** LMS tagging system, bidirectional GHL tag sync, inbound webhook processing, CRM field display
**Confidence:** HIGH

## Summary

Phase 23 builds two interconnected systems: (1) an LMS-native tagging system where coaches create color-coded tags, assign them to students, and configure auto-tagging rules, and (2) bidirectional tag sync with GoHighLevel plus inbound CRM field display on student profiles.

The existing codebase provides strong foundations from Phase 21 (GHL API client, contact linking, echo detection, sync event logging) and Phase 22 (outbound webhook dispatch with tag addition via `POST /contacts/:contactId/tags`). The key new work is: new database tables for LMS tags, a new inbound webhook endpoint for GHL ContactTagUpdate events, GHL contact data fetching for student profiles, and UI components for tag management and CRM field display.

The tagging system is purely LMS-side (Postgres tables + Drizzle ORM + React UI). The bidirectional sync extends the existing GHL infrastructure: outbound uses the proven `ghlClient.post()` + echo detection pattern; inbound requires a new webhook endpoint that receives GHL's ContactTagUpdate events, verifies the signature, checks for echoes, and syncs tags to the LMS. The CRM field display is read-only (prior decision: "window into CRM, not a mirror") and uses `GET /contacts/:contactId` to fetch fresh data.

**Primary recommendation:** Build LMS tags as a simple many-to-many relationship (tags table + student_tags join table). Use the existing `ghlClient` for outbound tag sync and `markOutboundChange`/`isEchoWebhook` for echo detection. Create a new `POST /api/webhooks/ghl` endpoint for inbound sync with shared-secret authentication (matching the enrollment webhook pattern, not RSA signature verification which requires OAuth app setup). Cache GHL contact data in a `ghl_contact_cache` jsonb column on `ghl_contacts` with a `lastFetchedAt` timestamp for the freshness indicator.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `ghlClient` | N/A (in codebase) | Rate-limited HTTP calls to GHL API for tag sync + contact fetch | Already built in Phase 21, handles 80/10s burst limit |
| Existing echo detection | N/A (in codebase) | Prevent infinite webhook loops on bidirectional tag sync | Already built, uses Redis TTL markers |
| Existing `sync_events` table | N/A (in DB) | Audit log for all inbound/outbound sync operations | Already has direction, status, retryCount columns |
| Drizzle ORM | ^0.45.1 | Database schema for tags tables + queries | Already in codebase |
| Zod | ^4.3.6 | Validate inbound webhook payloads from GHL | Already in codebase |
| `@upstash/redis` | ^1.36.1 | Echo detection + optional tag sync cache | Already in codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^0.563.0 | Tag icon, filter icon for tag UI | Already in codebase, provides Tag/Tags icons |
| `@radix-ui/react-popover` | ^1.1.15 | Color picker popover for tag creation | Already in codebase |
| `date-fns` | ^4.1.0 | Freshness indicator ("2 minutes ago") on GHL data | Already in codebase, `formatDistanceToNow` used elsewhere |
| `use-debounce` | ^10.1.0 | Debounce tag filter input | Already in codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared-secret webhook auth | RSA signature verification (`x-wh-signature`) | RSA requires GHL OAuth app setup (not PIT); shared secret matches existing enrollment webhook pattern and is simpler for single-tenant |
| `ghl_contact_cache` jsonb column | Separate `ghl_cached_fields` table | Extra table adds complexity; jsonb on existing `ghl_contacts` is simpler and the data is always 1:1 with the contact |
| Server-side tag filtering | Client-side filter with all tags loaded | Client-side is simpler for <1000 students but doesn't scale; server-side is correct pattern |
| Color enum in DB | Free-text hex color | Enum constrains to curated palette (better UX); hex gives full freedom but messy UX |

**Installation:**
```bash
# No new packages needed -- all dependencies already exist in the project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   ├── tags.ts                    # [NEW] tags + student_tags tables
│   └── index.ts                   # [MODIFY] add barrel export for tags
├── lib/
│   ├── ghl/
│   │   ├── client.ts              # [EXISTS] Rate-limited GHL API client
│   │   ├── contacts.ts            # [EXISTS] Contact linking service
│   │   ├── echo-detection.ts      # [EXISTS] Echo detection
│   │   ├── sync-logger.ts         # [EXISTS] Sync event logging
│   │   ├── webhooks.ts            # [EXISTS] Outbound webhook dispatch
│   │   ├── tag-sync.ts            # [NEW] Bidirectional tag sync logic
│   │   └── contact-fields.ts      # [NEW] Fetch + cache GHL contact custom fields
│   └── tags.ts                    # [NEW] Tag CRUD service (LMS-side)
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   └── ghl/
│   │   │       └── route.ts       # [NEW] Inbound GHL webhook endpoint
│   │   ├── admin/
│   │   │   └── tags/
│   │   │       ├── route.ts       # [NEW] Tag CRUD (GET list, POST create)
│   │   │       └── [tagId]/
│   │   │           └── route.ts   # [NEW] Tag update/delete
│   │   ├── students/
│   │   │   └── [studentId]/
│   │   │       ├── tags/
│   │   │       │   └── route.ts   # [NEW] Assign/remove tags from student
│   │   │       └── ghl-profile/
│   │   │           └── route.ts   # [NEW] Fetch GHL contact data for student profile
│   │   └── admin/
│   │       └── auto-tag-rules/
│   │           └── route.ts       # [NEW] Auto-tag rule CRUD
│   └── (dashboard)/
│       ├── admin/
│       │   └── students/
│       │       └── [studentId]/
│       │           └── page.tsx   # [MODIFY] Add GHL profile section + tags display
│       └── coach/
│           └── students/
│               ├── page.tsx       # [MODIFY] Add tag filter bar
│               └── StudentList.tsx # [MODIFY] Add tag badges to student rows
```

### Pattern 1: LMS Tag Schema (Many-to-Many)
**What:** Tags are a shared resource (coach-created or system-generated), assigned to students via a join table.
**When to use:** Standard pattern for tagging systems.
**Example:**
```typescript
// src/db/schema/tags.ts
import { pgTable, uuid, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

export const tagTypeEnum = pgEnum("tag_type", ["coach", "system"]);

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(), // hex color e.g. "#ef4444"
  type: tagTypeEnum("type").notNull().default("coach"),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const studentTags = pgTable("student_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id), // null = system-assigned
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});
// Add unique constraint on (userId, tagId) to prevent duplicate assignments
```

### Pattern 2: Outbound Tag Sync (LMS -> GHL)
**What:** When a coach assigns a tag in the LMS, sync it to GHL as a contact tag. Uses echo detection to prevent the inbound webhook from re-processing our own change.
**When to use:** Every time a tag is assigned or removed from a student in the LMS.
**Example:**
```typescript
// src/lib/ghl/tag-sync.ts
import { ghlClient } from "@/lib/ghl/client";
import { markOutboundChange } from "@/lib/ghl/echo-detection";
import { getGhlContactId } from "@/lib/ghl/contacts";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

export async function syncTagToGhl(
  userId: string,
  tagName: string,
  action: "add" | "remove"
): Promise<void> {
  const ghlContactId = await getGhlContactId(userId);
  if (!ghlContactId) return; // Student not linked to GHL

  // Mark for echo detection BEFORE making the API call
  await markOutboundChange(ghlContactId, "tag", tagName);

  if (action === "add") {
    await ghlClient.post(`/contacts/${ghlContactId}/tags`, {
      tags: [tagName],
    });
  } else {
    await ghlClient.delete(
      `/contacts/${ghlContactId}/tags`,
      // GHL DELETE /contacts/:contactId/tags expects body with tags array
    );
  }

  await logSyncEvent({
    eventType: `tag.${action}`,
    direction: "outbound",
    entityType: "tag",
    entityId: tagName,
    ghlContactId,
  });
}
```

### Pattern 3: Inbound Webhook Processing (GHL -> LMS)
**What:** GHL fires a ContactTagUpdate webhook when tags are modified on a contact. The LMS endpoint receives it, verifies authenticity, checks for echo, and syncs new tags.
**When to use:** Receiving any GHL webhook event.
**Example:**
```typescript
// src/app/api/webhooks/ghl/route.ts
// Follows same pattern as enrollment webhook: shared secret + rate limiting
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { isEchoWebhook } from "@/lib/ghl/echo-detection";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = getClientIp(req);
  const rl = await webhookLimiter.limit(ip);
  if (!rl.success) return rateLimitResponse(rl);

  // Verify shared secret
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.GHL_INBOUND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Handle ContactTagUpdate events
  if (body.type === "ContactTagUpdate") {
    // Check echo detection for each tag
    for (const tag of body.tags) {
      const isEcho = await isEchoWebhook(body.id, "tag", tag);
      if (isEcho) continue; // Skip our own changes

      // Process genuine external tag change
      await processInboundTag(body.id, body.tags);
    }
  }

  return NextResponse.json({ received: true });
}
```

### Pattern 4: GHL Contact Data Fetch + Cache
**What:** When a student profile is viewed, fetch their GHL contact data (custom fields, timezone, etc.) and cache it on the `ghl_contacts` row. Display with freshness indicator.
**When to use:** Student profile page load (server component).
**Example:**
```typescript
// src/lib/ghl/contact-fields.ts
import { ghlClient } from "@/lib/ghl/client";
import { db } from "@/db";
import { ghlContacts } from "@/db/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface GhlContactData {
  tags: string[];
  customFields: Array<{ id: string; value: unknown }>;
  timezone?: string;
  firstName?: string;
  lastName?: string;
}

export async function fetchGhlContactData(
  userId: string
): Promise<{ data: GhlContactData | null; lastFetchedAt: Date | null }> {
  const contact = await db.query.ghlContacts.findFirst({
    where: eq(ghlContacts.userId, userId),
  });

  if (!contact) return { data: null, lastFetchedAt: null };

  // Check cache freshness
  const cachedData = contact.cachedData as GhlContactData | null;
  const lastFetched = contact.lastFetchedAt;
  const isFresh = lastFetched && (Date.now() - lastFetched.getTime()) < CACHE_TTL_MS;

  if (isFresh && cachedData) {
    return { data: cachedData, lastFetchedAt: lastFetched };
  }

  // Fetch fresh data from GHL
  try {
    const response = await ghlClient.get<{ contact: GhlContactData }>(
      `/contacts/${contact.ghlContactId}`
    );

    const freshData: GhlContactData = {
      tags: response.data.contact.tags || [],
      customFields: response.data.contact.customFields || [],
      timezone: response.data.contact.timezone,
      firstName: response.data.contact.firstName,
      lastName: response.data.contact.lastName,
    };

    // Update cache
    await db.update(ghlContacts).set({
      cachedData: freshData,
      lastFetchedAt: new Date(),
    }).where(eq(ghlContacts.userId, userId));

    return { data: freshData, lastFetchedAt: new Date() };
  } catch (error) {
    // Return stale cache if available, otherwise null
    return { data: cachedData, lastFetchedAt: lastFetched };
  }
}
```

### Pattern 5: Auto-Tagging Rules
**What:** Coach-configured rules that automatically apply tags based on conditions (e.g., "At Risk" tag when no login for 7+ days). Rules are evaluated by the existing inactivity cron job or on-demand.
**When to use:** TAG-06 requirement.
**Example:**
```typescript
// Auto-tag rules stored in DB
export const autoTagRules = pgTable("auto_tag_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  conditionType: text("condition_type").notNull(), // "inactive_days", "no_progress_days", "course_completed"
  conditionValue: text("condition_value").notNull(), // e.g., "7" for 7 days
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Evaluated in the existing ghl-inactive cron or a new dedicated cron
```

### Anti-Patterns to Avoid
- **Syncing ALL GHL data to LMS tables:** Prior decision is "window into CRM, not a mirror." Cache GHL data as jsonb, don't normalize it into separate tables. Fetch fresh on profile view.
- **Using RSA signature verification for inbound webhooks:** RSA (`x-wh-signature`) requires OAuth app setup in GHL marketplace. Since we use Private Integration Token, use a shared-secret pattern instead (matching the enrollment webhook at `src/app/api/webhooks/enroll/route.ts`). The GHL workflow outbound webhook action supports custom headers.
- **Blocking the tag assignment response on GHL sync:** Tag assignment in the LMS should return immediately. GHL sync should be fire-and-forget (same pattern as milestone dispatch in Phase 22).
- **Creating tags as free-text on students:** Tags must be first-class entities (their own table) so they can be filtered by, color-coded, and managed centrally. Don't store tags as a text array on the users table.
- **Fetching GHL data on every page load without caching:** The GHL API has rate limits (80/10s burst). Cache contact data with a TTL and show a freshness indicator. Only re-fetch when stale or on explicit refresh.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limited GHL API calls | Custom rate limiter | Existing `ghlClient` + `ghlBurstLimiter` | Already handles 80/10s sliding window, 429 retry |
| Echo detection for bidirectional sync | Custom change tracking DB | Existing `markOutboundChange()` / `isEchoWebhook()` | Redis TTL markers already implemented and proven |
| Contact ID resolution | Email-based lookup per request | Existing `getGhlContactId()` / `findOrLinkContact()` | Persistent mapping in `ghl_contacts` table |
| Sync event audit trail | Custom logging | Existing `logSyncEvent()` / `markEventCompleted()` / `markEventFailed()` | Already has all needed fields and helper functions |
| Webhook rate limiting | Custom IP tracking | Existing `webhookLimiter` (10/min per IP) | Already used by enrollment webhook |
| Tag color palette | Custom color picker component | Predefined hex color array with Radix Popover | Simple grid of swatches is better UX than a full color picker |
| Exponential backoff for failed sync | Custom timer logic | Existing cron retry pattern from Phase 22 | `ghl-webhooks` cron already retries failed `sync_events` with backoff |

**Key insight:** Phase 21 and 22 built all the heavy GHL infrastructure. Phase 23 primarily adds LMS-native tagging (new tables + UI) and connects it to existing sync services. The genuinely new work is the tag schema, tag management UI, inbound webhook endpoint, and GHL profile display.

## Common Pitfalls

### Pitfall 1: Echo Detection Must Cover Both Add and Remove
**What goes wrong:** LMS adds a tag to GHL. GHL fires ContactTagUpdate webhook back. Without echo detection, the LMS processes it as a new inbound tag and potentially triggers another outbound sync.
**Why it happens:** The existing echo detection was built for outbound tag addition in Phase 22. Phase 23 extends this to tag removal and to the inbound direction.
**How to avoid:** Call `markOutboundChange(contactId, "tag", tagName)` before every outbound GHL API call (add or remove). In the inbound webhook handler, call `isEchoWebhook(contactId, "tag", tagName)` for each tag in the payload to detect our own changes.
**Warning signs:** Sync events log shows rapid back-and-forth tag additions between LMS and GHL (ping-pong effect).

### Pitfall 2: GHL ContactTagUpdate Sends Full Tag List, Not Delta
**What goes wrong:** The GHL webhook sends the contact's ENTIRE current tag list, not which tag was added/removed. You need to diff against the known state to determine what changed.
**Why it happens:** GHL's webhook payload schema includes `tags: string[]` which is the complete current set.
**How to avoid:** Store the last known GHL tag set (in the `ghl_contacts.cachedData` field). On each inbound webhook, diff the new tag list against the cached one to find additions and removals. Then process only the changes.
**Warning signs:** All GHL tags are re-synced to LMS on every webhook, even unchanged ones.

### Pitfall 3: Tag Naming Collision Between LMS and GHL
**What goes wrong:** A coach creates a tag called "VIP" in the LMS, and GHL also has a "VIP" tag from marketing. The systems fight over ownership.
**Why it happens:** Tags are identified by name (string), and both systems use free-text tag names.
**How to avoid:** Prior decision states: "Tag naming convention: `lms:{eventType}` for clear LMS ownership in GHL." Extend this: LMS-originated tags in GHL should have an `lms:` prefix. GHL marketing tags that sync to LMS should be imported as system tags with a "GHL" visual indicator. The tag type enum (`coach` vs `system`) helps distinguish origin.
**Warning signs:** Tags with identical names but different meanings appear in both systems.

### Pitfall 4: Schema Migration for ghl_contacts Cache Column
**What goes wrong:** Adding `cachedData` jsonb and `lastFetchedAt` columns to `ghl_contacts` table causes migration conflicts (same issue as Phase 21 where GHL tables were applied via direct SQL).
**Why it happens:** Prior decision notes "Applied GHL tables via direct SQL due to drizzle-kit migration journal conflicts with legacy DB tables."
**How to avoid:** Use `db:push` for schema changes (as the project is configured), OR apply via direct SQL if drizzle-kit generates conflicting migrations. Test with `db:generate` first to see what it produces.
**Warning signs:** `npm run db:generate` creates migration that tries to recreate existing tables.

### Pitfall 5: GHL API Returns Custom Fields by ID, Not Name
**What goes wrong:** The `GET /contacts/:contactId` response includes `customFields` as `[{id: "abc123", value: "America/New_York"}]`. The `id` is opaque -- you need the `ghl_field_mappings` table to map IDs to human-readable concepts (timezone, goals, native_language).
**Why it happens:** GHL custom fields are identified by internal IDs, not by human-readable keys.
**How to avoid:** Use the existing `ghl_field_mappings` table to map `ghlFieldId` -> `lmsConcept`. When displaying GHL data on the student profile, join custom field values against field mappings to show meaningful labels (e.g., "Timezone: America/New_York" instead of "abc123: America/New_York"). The admin GHL settings page already has FieldMappingTable for configuring these mappings.
**Warning signs:** Student profile shows raw field IDs instead of readable labels.

### Pitfall 6: Auto-Tag Rule Evaluation Timing
**What goes wrong:** Auto-tag rules (e.g., "At Risk" after 7 days inactive) only fire once per cron run. If the cron job runs daily at 8am UTC, a student who becomes inactive at 8:01am won't get tagged until the next day.
**Why it happens:** Auto-tagging is event-driven from cron, not real-time.
**How to avoid:** This is acceptable behavior for the current scale. The existing `ghl-inactive` cron already runs daily at 8am UTC. Integrate auto-tag rule evaluation into this cron. For real-time auto-tagging on progress events (e.g., "Course Completed" tag), hook into the existing `detectAndDispatchMilestones()` flow.
**Warning signs:** Users expect instant auto-tagging but it only updates daily.

## Code Examples

### GHL API Endpoints for Tags (Verified)
```typescript
// Source: GHL API docs (marketplace.gohighlevel.com)
// Base URL: https://services.leadconnectorhq.com

// Add tags to contact
// POST /contacts/:contactId/tags
// Body: { tags: ["tag1", "tag2"] }
// Response: 201 Created

// Remove tags from contact
// DELETE /contacts/:contactId/tags
// Body: { tags: ["tag1", "tag2"] }
// Response: 200 OK

// Get contact (includes tags + custom fields)
// GET /contacts/:contactId
// Response includes: { contact: { id, tags: [], customFields: [{id, value}], timezone, ... } }

// Headers required for all calls:
// Authorization: Bearer {GHL_API_TOKEN}
// Version: 2021-07-28
// Content-Type: application/json
```

### GHL ContactTagUpdate Webhook Payload (Verified)
```typescript
// Source: GHL Developer Portal - ContactTagUpdate webhook
// This is what GHL sends to our inbound webhook endpoint
interface GhlContactTagUpdatePayload {
  type: "ContactTagUpdate";
  locationId: string;
  id: string;              // GHL contact ID
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  tags: string[];           // FULL current tag list (not delta!)
  dnd: boolean;
  customFields: Array<{
    id: string;
    value: string | number | unknown[] | Record<string, unknown>;
  }>;
}
```

### Tag Color Palette (Predefined)
```typescript
// Curated color palette for tags -- covers common use cases
// Using Tailwind-compatible hex values
export const TAG_COLORS = [
  { name: "Red",     hex: "#ef4444", bg: "bg-red-500/20",    text: "text-red-400" },
  { name: "Orange",  hex: "#f97316", bg: "bg-orange-500/20", text: "text-orange-400" },
  { name: "Amber",   hex: "#f59e0b", bg: "bg-amber-500/20",  text: "text-amber-400" },
  { name: "Green",   hex: "#22c55e", bg: "bg-green-500/20",  text: "text-green-400" },
  { name: "Teal",    hex: "#14b8a6", bg: "bg-teal-500/20",   text: "text-teal-400" },
  { name: "Cyan",    hex: "#06b6d4", bg: "bg-cyan-500/20",   text: "text-cyan-400" },
  { name: "Blue",    hex: "#3b82f6", bg: "bg-blue-500/20",   text: "text-blue-400" },
  { name: "Purple",  hex: "#a855f7", bg: "bg-purple-500/20", text: "text-purple-400" },
  { name: "Pink",    hex: "#ec4899", bg: "bg-pink-500/20",   text: "text-pink-400" },
  { name: "Zinc",    hex: "#71717a", bg: "bg-zinc-500/20",   text: "text-zinc-400" },
] as const;
```

### Student Profile GHL Section Layout
```typescript
// Student profile GHL data display pattern
// Shows custom fields with freshness indicator + "View in GHL" button
<div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold">CRM Profile</h3>
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500">
        Updated {formatDistanceToNow(lastFetchedAt, { addSuffix: true })}
      </span>
      <a
        href={`https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${ghlContactId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-400 hover:text-blue-300"
      >
        View in GHL
      </a>
    </div>
  </div>
  {/* Custom fields grid */}
  <div className="grid grid-cols-2 gap-4">
    {mappedFields.map(field => (
      <div key={field.lmsConcept}>
        <label className="text-xs text-zinc-500">{field.label}</label>
        <p className="text-white">{field.value || "Not set"}</p>
      </div>
    ))}
  </div>
</div>
```

### Inbound Webhook Authentication Pattern
```typescript
// Source: Existing enrollment webhook pattern (src/app/api/webhooks/enroll/route.ts)
// GHL workflow sends outbound webhook with custom header containing shared secret
//
// GHL Workflow Setup:
// 1. Create workflow trigger: "Tag Added" or "Contact Changed"
// 2. Add "Webhook" action
// 3. Set URL to: https://your-lms.vercel.app/api/webhooks/ghl
// 4. Add custom header: x-webhook-secret = {GHL_INBOUND_WEBHOOK_SECRET}
// 5. Body: Full contact data (auto-populated by GHL)
//
// Env var: GHL_INBOUND_WEBHOOK_SECRET (set in Vercel dashboard)
```

### Auto-Tag Rule Evaluation in Cron
```typescript
// Extend the existing ghl-inactive cron to evaluate auto-tag rules
// src/app/api/cron/ghl-inactive/route.ts -- add after inactivity detection
async function evaluateAutoTagRules(inactiveStudents: InactiveStudent[]) {
  const rules = await db.select().from(autoTagRules).where(
    and(eq(autoTagRules.isActive, true), eq(autoTagRules.conditionType, "inactive_days"))
  );

  for (const rule of rules) {
    const threshold = parseInt(rule.conditionValue);
    for (const student of inactiveStudents) {
      if (student.daysSinceActive >= threshold) {
        // Check if student already has this tag
        const existing = await db.select().from(studentTags).where(
          and(eq(studentTags.userId, student.userId), eq(studentTags.tagId, rule.tagId))
        ).limit(1);

        if (existing.length === 0) {
          await db.insert(studentTags).values({
            userId: student.userId,
            tagId: rule.tagId,
            assignedBy: null, // system-assigned
          });
          // Fire-and-forget GHL sync
          syncTagToGhl(student.userId, tagName, "add").catch(console.error);
        }
      }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GHL API V1 for tags | GHL API V2 (`/contacts/:contactId/tags`) | Jan 2026 (V1 EOL) | Must use V2 endpoints |
| GHL OAuth webhook signatures | Shared secret for PIT-based integrations | N/A (architecture decision) | Simpler auth for single-tenant |
| Full CRM mirror in LMS | Read-only "window into CRM" with cached jsonb | Architecture decision | Less data duplication, simpler schema |
| Tag sync via n8n intermediary | Direct GHL API calls via `ghlClient` | Phase 21 decision | Lower latency, fewer moving parts |

**Deprecated/outdated:**
- GHL API V1: End of support Jan 2026. All tag endpoints must use V2.
- `@gohighlevel/api-client` SDK: Not used (prior decision). Native fetch via `ghlClient` is sufficient.
- GHL `GET /contacts` (list): Deprecated; use `GET /contacts/:contactId` (single) or Search Contacts.

## Open Questions

1. **GHL Webhook Delivery Mechanism for Inbound Sync**
   - What we know: GHL can send outbound webhooks from workflows (triggered by "Tag Added" events). GHL also has marketplace app webhook subscriptions (ContactTagUpdate event).
   - What's unclear: Since we use PIT (not OAuth app), can we subscribe to ContactTagUpdate via API, or must we use a GHL workflow with an outbound webhook action?
   - Recommendation: Use a GHL workflow-based outbound webhook. Create a GHL workflow triggered by "Contact Tag Updated" that sends a POST to our `/api/webhooks/ghl` endpoint with a custom `x-webhook-secret` header. This works with PIT and doesn't require marketplace app setup. Document the GHL workflow setup steps for the admin.

2. **Tag Removal Sync from GHL to LMS**
   - What we know: GHL sends the FULL tag list on ContactTagUpdate, not a delta. We need to diff to detect removals.
   - What's unclear: Should we automatically remove LMS tags when they disappear from GHL, or only add new ones?
   - Recommendation: Only sync GHL-originated tags (those with `type = "system"` and no `lms:` prefix). Coach-created tags should never be removed by GHL sync. For system/GHL tags, auto-remove when they disappear from the GHL tag list.

3. **Unique Constraint Strategy for student_tags**
   - What we know: Need to prevent duplicate (userId, tagId) pairs.
   - What's unclear: Drizzle ORM unique constraint syntax on composite keys.
   - Recommendation: Use `.unique()` on the combination via `pgTable` with a named unique index, or use `ON CONFLICT DO NOTHING` on insert. Drizzle supports both patterns.

4. **GHL Deep Link URL Format**
   - What we know: GHL contact pages are typically at `https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}`.
   - What's unclear: Is this URL format stable, or does it vary by GHL plan/version?
   - Recommendation: Use this format with the `GHL_LOCATION_ID` env var and the contact's `ghlContactId`. If GHL changes their URL format, it's a single constant to update. Mark as MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** (verified by reading actual source files):
  - `src/db/schema/ghl.ts` - Existing GHL tables (ghl_contacts, sync_events, ghl_field_mappings)
  - `src/lib/ghl/client.ts` - GHL API client with rate limiting
  - `src/lib/ghl/echo-detection.ts` - Redis echo detection (markOutboundChange, isEchoWebhook)
  - `src/lib/ghl/webhooks.ts` - Outbound webhook dispatch with tag addition
  - `src/lib/ghl/contacts.ts` - Contact linking service
  - `src/lib/ghl/sync-logger.ts` - Sync event logging
  - `src/app/api/webhooks/enroll/route.ts` - Shared-secret webhook auth pattern
  - `src/app/api/cron/ghl-inactive/route.ts` - Inactivity detection cron pattern
  - `src/app/(dashboard)/admin/students/[studentId]/page.tsx` - Student profile page structure
  - `src/components/admin/StudentList.tsx` - Student list with search/pagination
  - `src/app/(dashboard)/coach/students/StudentList.tsx` - Coach student list
  - `src/app/(dashboard)/admin/ghl/page.tsx` - GHL admin settings page
- [GHL Add Tags API](https://marketplace.gohighlevel.com/docs/ghl/contacts/add-tags/index.html) - `POST /contacts/:contactId/tags`, 201 response
- [GHL Remove Tags API](https://marketplace.gohighlevel.com/docs/ghl/contacts/remove-tags/index.html) - `DELETE /contacts/:contactId/tags`, 200 response
- [GHL Get Contact API](https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contact/index.html) - `GET /contacts/:contactId`, returns tags + customFields
- [GHL ContactTagUpdate Webhook](https://marketplace.gohighlevel.com/docs/webhook/ContactTagUpdate/index.html) - Full payload schema with tags array
- [GHL Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html) - Signature verification, event types

### Secondary (MEDIUM confidence)
- [GHL Webhook Signature Verification](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html) - RSA-SHA256 via `x-wh-signature` header (applicable to OAuth apps, not PIT)
- [GHL Custom Fields V2 API](https://marketplace.gohighlevel.com/docs/ghl/custom-fields/custom-fields-v-2-api/index.html) - Custom field structure (id + value format)
- Phase 22 Research (`22-RESEARCH.md`) - Established patterns for webhook dispatch, retry, cron jobs

### Tertiary (LOW confidence)
- GHL deep link URL format (`https://app.gohighlevel.com/v2/location/{id}/contacts/detail/{contactId}`) - Observed from GHL app, not officially documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already exist in codebase; no new dependencies needed
- Architecture: HIGH - Patterns directly extend existing Phase 21/22 infrastructure (echo detection, sync logging, GHL client, webhook auth)
- Pitfalls: HIGH - Identified from actual webhook payload analysis (full tag list not delta), codebase gaps (no tag schema), and migration history (direct SQL for GHL tables)
- GHL API endpoints: HIGH - Verified from official API docs (add tags, remove tags, get contact, webhook payload)
- GHL deep link URL: MEDIUM - Observed pattern, not officially documented as stable

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (stable -- no fast-moving dependencies)
