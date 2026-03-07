# Phase 66: Webhook Integration - Research

**Researched:** 2026-02-15
**Domain:** Extending existing enrollment webhook with RBAC role assignment, idempotency, and admin alerting
**Confidence:** HIGH

## Summary

Phase 66 modifies the existing enrollment webhook (`src/app/api/webhooks/enroll/route.ts`) to accept `roleId` or `roleName` in addition to the existing `courseId` payload. The existing webhook already handles user creation/lookup via Clerk, course access grants, rate limiting, and secret-based authentication. The work is additive: new optional fields in the payload, a new `processed_webhooks` table for idempotency, and admin notification on unknown roles. No new npm packages are needed.

The existing `assignRole()` function in `src/lib/user-roles.ts` already supports upsert semantics (checks for existing assignment, updates `expiresAt` if found, inserts otherwise). However, it requires an `assignedBy` user ID parameter that webhook calls do not have. The webhook handler must pass `null` for `assignedBy` to indicate a system/webhook assignment. The `userRoles` table already allows `assignedBy` to be nullable (per architecture doc: "null = webhook/system").

**Primary recommendation:** Modify the existing `/api/webhooks/enroll` route to handle role assignment alongside courseId. Use a `processed_webhooks` table with a caller-provided or derived idempotency key to prevent duplicate processing. Use the existing in-app notification system (`src/lib/notifications.ts`) to alert admin users when an unknown role is referenced.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM (existing) | 0.45+ | `processed_webhooks` table schema + role lookup queries | All 28 schema files use Drizzle. `onConflictDoNothing` already used in 16 files. |
| Zod (existing) | 4.3+ | Validate extended webhook payload (roleId, roleName, expiresAt) | Already used in GHL webhook route. Validates at API boundary. |
| Clerk SDK (existing) | @clerk/nextjs | User lookup/creation for new enrollments | Already used in enroll webhook. No changes needed. |
| Upstash Redis (existing) | @upstash/ratelimit | Rate limiting via `webhookLimiter` | Already configured at 10/min per IP for webhooks. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/lib/user-roles.ts` (existing) | -- | `assignRole()` upsert function | Called when webhook has roleId/roleName in payload |
| `src/lib/notifications.ts` (existing) | -- | `createNotification()` | Called to alert admins on unknown role |
| `src/lib/ghl/sync-logger.ts` (existing) | -- | `logSyncEvent()` | Audit trail for webhook processing events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `processed_webhooks` table | `userRoles` unique constraint only | Unique constraint handles duplicate role assignment but NOT idempotency for the full webhook (courseAccess + role in same payload). A dedicated table provides full-payload idempotency and audit trail. |
| In-app notification for admin alert | Email/Slack alert via n8n | In-app notification uses existing infrastructure (zero setup). Could add n8n outbound webhook for Slack/email in a later phase. |
| Deriving idempotency key from payload | Requiring caller to provide it | GHL may not support custom idempotency headers. Fallback to derived key (email + roleId/courseId hash) is safer. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/webhooks/enroll/route.ts    # MODIFIED: extended payload with roleId/roleName
├── db/schema/
│   ├── roles.ts                         # EXISTING: roles, userRoles tables
│   └── webhooks.ts                      # NEW: processed_webhooks table
├── db/schema/index.ts                   # MODIFIED: add export for webhooks
└── lib/
    ├── user-roles.ts                    # EXISTING: assignRole() -- may need signature tweak
    └── notifications.ts                 # EXISTING: createNotification() for admin alerts
```

### Pattern 1: Extended Webhook Payload (Backward Compatible)
**What:** Add optional `roleId`, `roleName`, and `roleExpiresAt` fields to the existing `EnrollmentPayload` interface. The handler processes role fields only when present, leaving existing `courseId` flow untouched.
**When to use:** Any webhook that adds new capabilities while maintaining backward compatibility.
**Example:**
```typescript
// Source: existing enroll/route.ts interface + RBAC architecture doc
interface EnrollmentPayload {
  email: string;
  name?: string;
  // EXISTING (legacy) -- still works
  courseId?: string;
  accessTier?: "preview" | "full";
  expiresAt?: string;
  // NEW (RBAC) -- optional
  roleId?: string;       // UUID of a role
  roleName?: string;      // Case-insensitive name lookup
  roleExpiresAt?: string; // ISO 8601 expiration for role assignment
  // NEW (idempotency) -- optional
  idempotencyKey?: string; // Caller-provided key to prevent duplicate processing
}
```

### Pattern 2: Idempotency via processed_webhooks Table
**What:** Before processing any webhook, check if the idempotency key already exists in `processed_webhooks`. If found, return the cached result without re-processing. If not found, process the webhook and insert the key after success.
**When to use:** Any inbound webhook where the caller may retry.
**Example:**
```typescript
// Source: RBAC Pitfalls doc (Pitfall 4), adapted for existing codebase patterns
const idempotencyKey = body.idempotencyKey
  || `enroll:${body.email}:${body.roleId || body.roleName || ''}:${body.courseId || ''}`;

const existing = await db.query.processedWebhooks.findFirst({
  where: eq(processedWebhooks.idempotencyKey, idempotencyKey),
});

if (existing) {
  return NextResponse.json({
    success: true,
    message: "Already processed",
    userId: existing.resultData?.userId,
  });
}

// ... process webhook ...

await db.insert(processedWebhooks).values({
  idempotencyKey,
  source: "enrollment",
  eventType: body.roleId || body.roleName ? "role_assignment" : "course_access",
  payload: body,
  result: "success",
  resultData: { userId: dbUser.id },
}).onConflictDoNothing(); // Race condition safety
```

### Pattern 3: Case-Insensitive Role Name Lookup
**What:** When webhook provides `roleName` instead of `roleId`, look up the role using case-insensitive matching on the unique `name` column in the `roles` table. The `roles.name` column has a UNIQUE constraint.
**When to use:** When external systems may send role names in different casing.
**Example:**
```typescript
// Source: RBAC Architecture doc, verified against roles.ts schema
import { ilike, and, isNull } from "drizzle-orm";

const role = await db.query.roles.findFirst({
  where: and(
    ilike(roles.name, body.roleName), // Case-insensitive exact match
    isNull(roles.deletedAt)           // Skip soft-deleted roles
  ),
});
```

### Pattern 4: Admin Alert on Unknown Role
**What:** When webhook references a `roleId` or `roleName` that does not exist in the database, create an in-app notification for all admin users using the existing notification system.
**When to use:** WEBHOOK-06 requirement.
**Example:**
```typescript
// Source: existing notifications.ts pattern
import { createNotification } from "@/lib/notifications";

// Find all admin users
const admins = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.role, "admin"));

for (const admin of admins) {
  await createNotification({
    userId: admin.id,
    type: "system",
    category: "system",
    title: "Unknown role in webhook",
    body: `Enrollment webhook referenced unknown role: "${body.roleId || body.roleName}". Student ${body.email} was NOT assigned a role. Check role configuration.`,
    linkUrl: "/admin/roles",
  });
}
```

### Anti-Patterns to Avoid
- **Silently ignoring unknown roles:** The webhook must NOT return 200 and skip role assignment when the role is not found. This leads to students paying for a tier but receiving nothing. Return 404 (or 422) so external systems can detect the misconfiguration.
- **Processing role and course in separate webhooks:** The architecture explicitly supports both `roleId` AND `courseId` in the same payload, processed independently. Do not require two separate webhook calls.
- **Using SQL `LOWER()` for case-insensitive lookup:** Drizzle's `ilike()` is the idiomatic approach and already used in `src/lib/roles.ts` (getRoles search). Using raw `sql` template for LOWER() works but is less type-safe.
- **Recording processed webhook BEFORE processing:** If processing fails after recording, the webhook is permanently marked as processed and retries are blocked. Record AFTER success, use `onConflictDoNothing` for race conditions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency key generation | Custom hash/UUID generation | Deterministic string concatenation of payload fields | Hashing adds complexity. A simple `email:roleId:courseId` string is human-readable in debug logs and sufficient for uniqueness. |
| Admin alerting | Custom email/Slack integration | Existing `createNotification()` from `src/lib/notifications.ts` | Already handles mute preferences, DB insertion, and the notification bell UI. Zero new infrastructure. |
| Rate limiting | Custom rate limiter | Existing `webhookLimiter` from `src/lib/rate-limit.ts` | Already configured at 10/min per IP using Upstash Redis. Proven pattern across all webhook routes. |
| User creation/lookup | Custom Clerk integration | Existing logic in `/api/webhooks/enroll/route.ts` (lines 50-85) | Already handles find-by-email, create-if-not-exists, DB sync. Just reuse it. |
| Role assignment upsert | Custom INSERT + UPDATE logic | Existing `assignRole()` from `src/lib/user-roles.ts` | Already handles upsert (check existing, update or insert). |

**Key insight:** This phase is primarily about wiring existing services together with a new code path in the webhook handler, not about building new infrastructure. The only truly new artifact is the `processed_webhooks` table.

## Common Pitfalls

### Pitfall 1: assignRole() Requires Non-Null assignedBy
**What goes wrong:** The existing `assignRole()` function signature is `assignRole(userId, roleId, assignedBy, expiresAt?)` where `assignedBy` is typed as `string`. Passing `null` for webhook-initiated assignments causes a TypeScript error.
**Why it happens:** The function was written for the admin UI context in Phase 65 where there is always an authenticated coach/admin user.
**How to avoid:** Either (a) modify `assignRole()` to accept `string | null` for `assignedBy`, or (b) use Drizzle's `onConflictDoUpdate` directly in the webhook handler (as shown in the architecture doc). Option (a) is cleaner since `userRoles.assignedBy` is already nullable in the schema.
**Warning signs:** TypeScript compilation error when calling `assignRole()` with `null`.

### Pitfall 2: Validation Must Allow courseId-Only OR roleId/roleName-Only OR Both
**What goes wrong:** The existing Zod schema requires `email` AND `courseId`. Adding `roleId`/`roleName` as optional is fine, but the requirement for `courseId` must change from required to optional -- otherwise payloads with only `roleId` fail validation.
**Why it happens:** The original webhook was designed only for course enrollment.
**How to avoid:** Make `courseId` optional in the Zod schema. Add a custom refinement: at least one of `courseId`, `roleId`, or `roleName` must be present. The validation error message should explain what is expected.
**Warning signs:** Existing courseId-only payloads work fine, but new roleId-only payloads return 400.

### Pitfall 3: ilike vs LOWER/sql for Case-Insensitive Lookup
**What goes wrong:** Using `ilike(roles.name, body.roleName)` may match partial names if the caller sends a substring. For example, roleName "Gold" would match "Gold" but also need to NOT match "Gold Plus".
**Why it happens:** `ilike` is a pattern match, not exact match. Without wildcards it IS an exact match (just case-insensitive), but this is a subtlety that may confuse developers.
**How to avoid:** `ilike(roles.name, body.roleName)` without wildcards IS an exact case-insensitive match. This is correct. Do NOT add `%` wildcards. Verify with a test case.
**Warning signs:** Multiple roles returned when expecting one.

### Pitfall 4: Idempotency Key Must Include All Discriminating Fields
**What goes wrong:** If the idempotency key is just `email:roleId`, then sending the SAME email with DIFFERENT roleIds is correctly treated as two separate events. But if the key is just `email`, then assigning "Gold" and then "Silver" to the same email is incorrectly treated as a duplicate.
**Why it happens:** Insufficient granularity in the key derivation.
**How to avoid:** Derive the key as `enroll:{email}:{roleId|roleName}:{courseId}` or accept it from the caller. If the caller provides an explicit `idempotencyKey`, always use it (the caller knows their event model best).
**Warning signs:** Second webhook call for different role returns "Already processed".

### Pitfall 5: Unknown Role Should Return 404, Not 200
**What goes wrong:** If an unknown role causes a 200 response, the external system (GHL/n8n) believes the enrollment succeeded. The student has no role assignment but the sales system shows them as enrolled.
**Why it happens:** Some webhook designs return 200 for all requests to prevent retries. The GHL webhook handler does this (`/api/webhooks/ghl/route.ts` always returns 200). But the enrollment webhook is different -- it is called from an n8n workflow that CAN handle non-200 responses.
**How to avoid:** Return 404 for unknown roles, with a descriptive error body. The n8n workflow can be configured to handle the error (alert, retry with correct role, etc.). Also create admin notification (WEBHOOK-06). Log via `syncEvents` for audit trail.
**Warning signs:** Students reporting they purchased a tier but have no access.

### Pitfall 6: processed_webhooks Table Grows Unbounded
**What goes wrong:** Every webhook call creates a `processed_webhooks` row. Over months, this table grows large. It is only needed for deduplication within a short window (minutes to hours).
**Why it happens:** No cleanup mechanism.
**How to avoid:** Add a `processedAt` timestamp and periodically clean rows older than 7 days via a cron job or manual SQL. Alternatively, add a TTL index. For Phase 66, a simple timestamp column is sufficient -- cleanup can be a future chore.
**Warning signs:** `processed_webhooks` table exceeds 100K rows.

## Code Examples

Verified patterns from the existing codebase:

### Existing Webhook Authentication Pattern
```typescript
// Source: src/app/api/webhooks/enroll/route.ts (lines 17-29)
const ip = getClientIp(req);
const rl = await webhookLimiter.limit(ip);
if (!rl.success) return rateLimitResponse(rl);

const secret = req.headers.get("x-webhook-secret");
if (secret !== process.env.ENROLLMENT_WEBHOOK_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Existing User Find-or-Create Pattern
```typescript
// Source: src/app/api/webhooks/enroll/route.ts (lines 50-85)
// 1. Search Clerk by email
// 2. Create Clerk user if not found
// 3. Sync to DB users table
// This logic stays unchanged -- role assignment runs AFTER user creation.
```

### Existing assignRole() Usage
```typescript
// Source: src/lib/user-roles.ts (lines 38-62)
export async function assignRole(
  userId: string,
  roleId: string,
  assignedBy: string,  // <-- Needs to become string | null for webhook use
  expiresAt?: Date
) {
  // Upsert: checks existing, updates expiresAt if found, inserts if not
}
```

### Existing onConflictDoUpdate Pattern
```typescript
// Source: src/lib/xp-service.ts (lines 131-134)
.onConflictDoUpdate({
  target: [dailyActivity.userId, dailyActivity.activityDate],
  set: { totalXp: sql`${dailyActivity.totalXp} + ${amount}` },
})
```

### Existing Admin Notification Pattern
```typescript
// Source: src/lib/notifications.ts
await createNotification({
  userId: adminId,
  type: "system",
  category: "system",
  title: "...",
  body: "...",
  linkUrl: "/admin/...",
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| courseId-only webhook payload | courseId + roleId/roleName dual payload | Phase 66 (this phase) | Enables external systems to assign RBAC roles, not just course access |
| No idempotency protection | processed_webhooks table with unique key | Phase 66 (this phase) | Prevents duplicate processing from webhook retries |
| Silent failure on unknown entities | Admin notification + 404 response | Phase 66 (this phase) | Sales/ops team alerted immediately when role configuration drifts |

**Deprecated/outdated:**
- Nothing deprecated. The existing courseId-only flow is fully preserved as backward compatible.

## Open Questions

1. **GHL Webhook Payload Format**
   - What we know: The enrollment webhook is called from an n8n workflow, not directly from GHL. The n8n workflow receives GHL contact events and transforms them into the enrollment webhook payload format.
   - What's unclear: What fields does the n8n workflow currently send? Does it send an idempotency key? Does it send any role-related data already?
   - Recommendation: Check the n8n workflow (ID: `hOcKM0sSeT7D2FjL` or related) configuration. For planning purposes, assume the n8n workflow will be updated to include `roleName` (not `roleId`, since n8n operators know role names, not UUIDs). The idempotency key can be derived if not provided.

2. **Admin Alert Scope**
   - What we know: `createNotification()` requires a specific `userId`. WEBHOOK-06 says "Admin receives alert." There may be multiple admin users.
   - What's unclear: Should ALL admins get the notification, or just one? Should the notification type be "system" (existing enum value)?
   - Recommendation: Notify all users with `role = 'admin'` in the `users` table. Use `type: "system"` and `category: "system"`. This is at most 2-3 users based on the current data model.

3. **Idempotency Window**
   - What we know: The `processed_webhooks` table will track all processed webhooks with timestamps.
   - What's unclear: How long should the deduplication window be? Permanent (check all-time) or time-limited (last 24 hours)?
   - Recommendation: Check all-time for Phase 66 (simplest, most correct). Add a cleanup task later if the table grows large. The `processedAt` timestamp enables time-based cleanup when needed.

4. **Error Response for Unknown Role: 404 vs 422**
   - What we know: Architecture doc says return 404. The existing webhook returns 404 for unknown courseId.
   - What's unclear: External systems may interpret 404 differently from 422 (Unprocessable Entity).
   - Recommendation: Return 404 for consistency with existing courseId pattern. The error body includes the role identifier for debugging.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/app/api/webhooks/enroll/route.ts` -- current enrollment webhook handler (verified, read in full)
- Existing codebase: `src/lib/user-roles.ts` -- assignRole() function with upsert semantics (verified, read in full)
- Existing codebase: `src/db/schema/roles.ts` -- roles, userRoles, roleCourses, roleFeatures tables (verified, read in full)
- Existing codebase: `src/lib/notifications.ts` -- createNotification() with mute preference checking (verified, read in full)
- Existing codebase: `src/lib/rate-limit.ts` -- webhookLimiter at 10/min per IP (verified, read in full)
- `.planning/research/v9.0-RBAC-ARCHITECTURE.md` -- Enrollment Webhook Integration section (lines 631-718)
- `.planning/research/v7.0-RBAC-PITFALLS.md` -- Pitfall 4 (idempotency) and Pitfall 5 (unknown roles)
- `.planning/research/v9.0-RBAC-STACK.md` -- Zero new dependencies thesis, idempotency approach
- `.planning/REQUIREMENTS.md` -- WEBHOOK-01 through WEBHOOK-06 specifications
- Phase 65 summaries (65-01, 65-02) -- role assignment and access enforcement complete

### Secondary (MEDIUM confidence)
- `.planning/research/v9.0-RBAC-SUMMARY.md` -- processed_webhooks table design
- `.planning/STATE.md` -- "Research suggests confirming GHL webhook payload format before Phase 66"

### Tertiary (LOW confidence)
- None. All findings verified against codebase or planning docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new packages, all existing infrastructure verified
- Architecture: HIGH -- architecture doc provides detailed webhook handler pseudocode, verified against current codebase
- Pitfalls: HIGH -- pitfall 4 (idempotency) and pitfall 5 (unknown roles) documented in detail in prior research, cross-verified with current code
- Code examples: HIGH -- all examples sourced from existing codebase files with line numbers

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable domain, no fast-moving dependencies)
