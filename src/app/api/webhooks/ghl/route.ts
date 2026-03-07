// src/app/api/webhooks/ghl/route.ts
// Inbound GHL webhook endpoint for contact events (tag updates, etc.)
// Verifies shared secret, rate limits by IP, and routes events to processors.
// Always returns 200 to GHL to prevent retries and noise.

import { NextRequest, NextResponse } from "next/server";
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { processInboundTagUpdate } from "@/lib/ghl/tag-sync";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

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
    // Verify shared secret
    const secret = req.headers.get("x-webhook-secret");
    if (secret !== process.env.GHL_INBOUND_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ghlWebhookSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[GHL Webhook] Invalid payload:", parsed.error.issues);
      // Return 200 anyway -- don't cause GHL retries for bad payloads
      return NextResponse.json({ received: true, error: "invalid_payload" });
    }

    const event = parsed.data;

    // Route by event type
    switch (event.type) {
      case "ContactTagUpdate": {
        const tagEvent = contactTagUpdateSchema.safeParse(body);
        if (!tagEvent.success) {
          console.error("[GHL Webhook] Invalid ContactTagUpdate:", tagEvent.error.issues);
          return NextResponse.json({ received: true, error: "invalid_tag_update" });
        }
        // Process asynchronously but within the request lifecycle
        // (GHL expects quick response, but we can do the work here)
        await processInboundTagUpdate(tagEvent.data.id, tagEvent.data.tags);
        break;
      }
      default: {
        // Unknown event type -- log for future extensibility
        await logSyncEvent({
          eventType: `webhook.${event.type}`,
          direction: "inbound",
          entityType: "webhook",
          entityId: event.id,
          payload: { type: event.type, unhandled: true },
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
