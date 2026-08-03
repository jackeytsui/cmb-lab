// src/app/api/webhooks/ghl/route.ts
// Inbound GHL webhook endpoint for contact events (tag updates, etc.)
// Accepts both native GHL webhook format (ContactTagUpdate) and Custom Webhook
// action format (key-value body, JSON or form-encoded).
// Always returns 200 to prevent GHL retries.

import { NextRequest, NextResponse } from "next/server";
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { processInboundTagUpdate } from "@/lib/ghl/tag-sync";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import {
  normalizeWebhookBody,
  extractSecretFromBody,
  secretMatches,
} from "@/lib/ghl/webhook-auth";
import { db } from "@/db";
import { ghlLocations } from "@/db/schema";
import { eq } from "drizzle-orm";

// GHL Custom Webhook actions send tags as a comma-separated string;
// native GHL webhook triggers send tags as a JSON array. Accept both.
const tagsField = z.union([
  z.array(z.string()),
  z.string().transform(s => s.split(",").map(t => t.trim()).filter(Boolean)),
]);

const contactTagUpdateSchema = z.object({
  id: z.string(),
  tags: tagsField,
  locationId: z.string(),
});

// Parse the request body regardless of Content-Type.
// GHL Custom Webhook actions may send form-encoded or JSON.
async function parseBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      return Object.fromEntries(formData.entries()) as Record<string, unknown>;
    }
    // Default: try JSON (also handles missing/wrong content-type)
    const text = await req.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Last resort: try form-encoded even if content-type said JSON
      const params = new URLSearchParams(text);
      const result: Record<string, unknown> = {};
      for (const [k, v] of params.entries()) result[k] = v;
      return Object.keys(result).length > 0 ? result : null;
    }
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await webhookLimiter.limit(ip);
  if (!rl.success) return rateLimitResponse(rl);

  try {
    const rawBody = await parseBody(req);
    if (!rawBody) {
      console.error("[GHL Webhook] Could not parse body");
      return NextResponse.json({ received: true, error: "invalid_payload" });
    }

    // GHL Custom Webhook configs are hand-typed — trim stray whitespace from
    // keys/values, and pull any secret out of the body before logging it.
    const body = normalizeWebhookBody(rawBody);
    const bodySecret = extractSecretFromBody(body);

    console.log("[GHL Webhook] Received body:", JSON.stringify(body));

    // Extract fields — support both snake_case and camelCase locationId
    const eventType = typeof body.type === "string" ? body.type : "ContactTagUpdate";
    const contactId = body.id ?? body.contactId;
    const locationId = body.locationId ?? body.location_id;
    const rawTags = body.tags;

    // Secret may arrive via header (preferred) or body field (fallback for
    // workflows that can't set custom headers).
    const headerSecret = req.headers.get("x-webhook-secret");
    const providedSecret = headerSecret?.trim() || bodySecret;
    const globalSecret = process.env.GHL_INBOUND_WEBHOOK_SECRET;

    // Verify secret: the per-location secret (when configured) and the
    // global secret are both accepted, so a stale row in ghl_locations can't
    // lock out a workflow that still sends the valid global secret.
    let locationSecret: string | null = null;
    if (locationId && typeof locationId === "string") {
      const locationRows = await db
        .select({ webhookSecret: ghlLocations.webhookSecret })
        .from(ghlLocations)
        .where(eq(ghlLocations.ghlLocationId, locationId))
        .limit(1);

      if (locationRows.length === 0) {
        console.warn("[GHL Webhook] Unknown location:", locationId);
        await logSyncEvent({
          eventType: "webhook.unknown_location",
          direction: "inbound",
          entityType: "webhook",
          entityId: typeof contactId === "string" ? contactId : "unknown",
          payload: { locationId, type: eventType, body },
        });
        return NextResponse.json({ received: true, error: "unknown_location" });
      }

      locationSecret = locationRows[0].webhookSecret;
    }

    const verified = secretMatches(providedSecret, [locationSecret, globalSecret]);

    if (!verified) {
      // Log enough to diagnose which side of the comparison is broken,
      // without ever logging secret values.
      console.warn("[GHL Webhook] Unauthorized — secret mismatch", {
        locationId: typeof locationId === "string" ? locationId : null,
        headerSecretPresent: !!headerSecret,
        bodySecretPresent: !!bodySecret,
        locationSecretConfigured: !!locationSecret,
        globalSecretConfigured: !!globalSecret,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Route: ContactTagUpdate (native or custom webhook)
    if (eventType === "ContactTagUpdate" || (contactId && rawTags !== undefined)) {
      const parsed = contactTagUpdateSchema.safeParse({
        id: contactId,
        tags: rawTags,
        locationId: locationId ?? "",
      });

      if (!parsed.success) {
        console.error("[GHL Webhook] Invalid tag update payload:", parsed.error.issues, "body:", body);
        return NextResponse.json({ received: true, error: "invalid_tag_update" });
      }

      await processInboundTagUpdate(
        parsed.data.id,
        parsed.data.tags,
        parsed.data.locationId
      );
    } else {
      await logSyncEvent({
        eventType: `webhook.${eventType}`,
        direction: "inbound",
        entityType: "webhook",
        entityId: typeof contactId === "string" ? contactId : "unknown",
        payload: { type: eventType, locationId, unhandled: true },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[GHL Webhook] Processing error:", error);
    return NextResponse.json({ received: true, error: "processing_error" });
  }
}
