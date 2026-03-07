---
phase: 23
plan: 02
subsystem: ghl-sync
tags: [ghl, tags, webhooks, sync, caching]
depends_on: ["23-01"]
provides: ["bidirectional-tag-sync", "ghl-contact-cache", "inbound-webhook"]
affects: ["23-03"]
tech-stack:
  added: []
  patterns: ["fire-and-forget sync", "diff-based inbound processing", "TTL cache with graceful degradation"]
key-files:
  created:
    - src/lib/ghl/tag-sync.ts
    - src/lib/ghl/contact-fields.ts
    - src/app/api/webhooks/ghl/route.ts
    - src/app/api/students/[studentId]/ghl-profile/route.ts
  modified:
    - src/app/api/students/[studentId]/tags/route.ts
    - src/app/api/cron/ghl-inactive/route.ts
decisions:
  - GHL tag removal uses DELETE /contacts/:id/tags/:tagName endpoint
  - Inbound webhook uses shared secret (GHL_INBOUND_WEBHOOK_SECRET) not RSA signature for simplicity
  - Coach tags protected from auto-removal by inbound webhooks (only system tags auto-removed)
  - Auto-tag rules evaluated in existing cron after inactivity detection (additive, not separate cron)
metrics:
  duration: 3min
  completed: 2026-01-31
---

# Phase 23 Plan 02: Bidirectional Tag Sync & GHL Contact Cache Summary

Bidirectional tag sync between LMS and GHL with echo detection, inbound webhook processing, contact data caching with 5-min TTL, and auto-tag rule integration in inactivity cron.

## What Was Built

### Tag Sync Service (`src/lib/ghl/tag-sync.ts`)
- `syncTagToGhl(userId, tagName, action, options)` - Outbound sync with echo marking before API call. Coach tags prefixed with `lms:` in GHL, system tags sync as-is.
- `syncTagRemovalFromGhl(userId, tagName)` - Convenience wrapper for removal.
- `processInboundTagUpdate(ghlContactId, currentGhlTags)` - Diffs full tag list against cached tags. Creates system tags for GHL-originated tags. Skips echoes. Protects coach tags from auto-removal.

### GHL Inbound Webhook (`src/app/api/webhooks/ghl/route.ts`)
- POST handler with rate limiting (10/min per IP) and shared secret verification.
- Routes `ContactTagUpdate` events to `processInboundTagUpdate`.
- Always returns 200 to GHL (never 5xx) to prevent retries.
- Extensible switch/case for future event types.

### Contact Field Cache (`src/lib/ghl/contact-fields.ts`)
- `fetchGhlContactData(userId)` - 5-minute TTL cache. Returns stale cache on fetch failure.
- `refreshGhlContactData(userId)` - Force refresh bypassing cache.
- `resolveCustomFields(customFields, mappings)` - Maps GHL field IDs to labels via ghl_field_mappings table.

### Student GHL Profile API (`src/app/api/students/[studentId]/ghl-profile/route.ts`)
- GET with coach+ auth. Returns data, resolved fields, freshness timestamp, deep link.
- Supports `?refresh=true` query param.

### Auto-Tag Integration (modified `src/app/api/cron/ghl-inactive/route.ts`)
- `evaluateAutoTagRules()` runs after inactivity detection.
- Fetches active rules where conditionType = "inactive_days".
- Assigns matching tags and syncs to GHL via fire-and-forget.

### Student Tags API Wiring (modified `src/app/api/students/[studentId]/tags/route.ts`)
- POST handler: fire-and-forget `syncTagToGhl` after successful `assignTag`.
- DELETE handler: fire-and-forget `syncTagToGhl` removal after successful `removeTag`.

## Echo Loop Prevention Architecture

| Source | Flow | Outbound Sync? |
|--------|------|----------------|
| LMS UI (api) | assignTag -> syncTagToGhl | Yes |
| GHL webhook | processInboundTagUpdate -> assignTag(source:webhook) | No |
| Cron/system | assignTag -> syncTagToGhl | Yes |

Echo detection (`markOutboundChange` / `isEchoWebhook`) serves as secondary safety net.

## Environment Variables

New required variable:
- `GHL_INBOUND_WEBHOOK_SECRET` - Shared secret for GHL inbound webhook verification

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **GHL tag removal endpoint**: Uses `DELETE /contacts/:id/tags/:tagName` (URL-encoded tag name in path).
2. **Shared secret auth**: Used `x-webhook-secret` header with `GHL_INBOUND_WEBHOOK_SECRET` env var rather than RSA signature verification for simplicity.
3. **Coach tag protection**: Inbound webhooks only auto-remove system tags. Coach tags require explicit LMS action.
4. **Auto-tag in existing cron**: Added as additive step after inactivity detection rather than separate cron route.

## Verification Results

- TypeScript compiles cleanly (`npx tsc --noEmit`)
- Outbound flow: assignTag -> syncTagToGhl -> markOutboundChange -> ghlClient.post
- Inbound flow: webhook -> shared secret check -> diff tags -> echo check -> assignTag/removeTag
- Contact cache: 5-min TTL with graceful degradation on fetch failure
- Auto-tag rules: evaluated in cron with fire-and-forget GHL sync
