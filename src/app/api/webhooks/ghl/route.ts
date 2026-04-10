// src/app/api/webhooks/ghl/route.ts
// Inbound GHL webhook endpoint for contact events (tag updates, etc.)
// Multi-location aware: verifies locationId against known ghlLocations,
// uses per-location webhook secret for verification.
// Always returns 200 to GHL to prevent retries and noise.

import { NextRequest, NextResponse } from "next/server";
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { processInboundTagUpdate } from "@/lib/ghl/tag-sync";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { db } from "@/db";
import { ghlLocations } from "@/db/schema";
import { eq } from "drizzle-orm";

// --- Zod schemas for GHL webhook payloads ---

const contactTagUpdateSchema = z.object({
  type: z.literal("ContactTagUpdate"),
  id: z.string(), // GHL contact ID
  tags: z.array(z.string()),
  locationId: z.string(),
});

const ghlWebhookSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  locationId: z.string().optional(),
}).passthrough(); // Allow additional fields for future event types

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = getClientIp(req);
  const rl = await webhookLimiter.limit(ip);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  try {
    const body = await req.json();
    const parsed = ghlWebhookSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[GHL Webhook] Invalid payload:", parsed.error.issues);
      return NextResponse.json({ received: true, error: "invalid_payload" });
    }

    const event = parsed.data;

    // Verify webhook secret: try per-location first, then fall back to global env var
    const secret = req.headers.get("x-webhook-secret");
    let verified = false;

    if (event.locationId) {
      // Look up per-location webhook secret
      const locationRows = await db
        .select({ webhookSecret: ghlLocations.webhookSecret })
        .from(ghlLocations)
        .where(eq(ghlLocations.ghlLocationId, event.locationId))
        .limit(1);

      if (locationRows.length > 0 && locationRows[0].webhookSecret) {
        verified = secret === locationRows[0].webhookSecret;
      } else {
        // Location found but no per-location secret — fall back to global
        verified = secret === process.env.GHL_INBOUND_WEBHOOK_SECRET;
      }

      // Check that the location is known
      if (locationRows.length === 0) {
        await logSyncEvent({
          eventType: `webhook.unknown_location`,
          direction: "inbound",
          entityType: "webhook",
          entityId: event.id,
          payload: { locationId: event.locationId, type: event.type },
        });
        // Still return 200 — don't cause GHL retries
        return NextResponse.json({ received: true, error: "unknown_location" });
      }
    } else {
      // No locationId in payload — use global secret
      verified = secret === process.env.GHL_INBOUND_WEBHOOK_SECRET;
    }

    if (!verified) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Route by event type
    switch (event.type) {
      case "ContactTagUpdate": {
        const tagEvent = contactTagUpdateSchema.safeParse(body);
        if (!tagEvent.success) {
          console.error("[GHL Webhook] Invalid ContactTagUpdate:", tagEvent.error.issues);
          return NextResponse.json({ received: true, error: "invalid_tag_update" });
        }
        await processInboundTagUpdate(
          tagEvent.data.id,
          tagEvent.data.tags,
          tagEvent.data.locationId
        );
        break;
      }
      default: {
        await logSyncEvent({
          eventType: `webhook.${event.type}`,
          direction: "inbound",
          entityType: "webhook",
          entityId: event.id,
          payload: { type: event.type, locationId: event.locationId, unhandled: true },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Never return 5xx to GHL -- causes retries and noise
    console.error("[GHL Webhook] Processing error:", error);
    return NextResponse.json({ received: true, error: "processing_error" });
  }
}
