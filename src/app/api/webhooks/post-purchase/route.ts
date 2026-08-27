import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ghlLocations, processedWebhooks } from "@/db/schema";
import {
  getClientIp,
  rateLimitResponse,
  webhookLimiter,
} from "@/lib/rate-limit";
import { webhookSecretsMatch } from "@/lib/webhook-secret";
import { provisionPostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";
import { canonicalizePostPurchasePayload } from "@/lib/ghl/post-purchase-webhook";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const selectionSchema = z.union([
  z.string().trim().min(1).max(1000),
  z.array(z.string().trim().min(1).max(300)).min(1).max(20),
]);
const optionalSelectionSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  selectionSchema.optional(),
);

const postPurchaseSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  name: z.string().trim().max(240).optional(),
  productLine: selectionSchema,
  addOnPurchased: optionalSelectionSchema,
  contactId: z.string().trim().min(1).max(120),
  locationId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(1).max(500).optional(),
});

async function parseBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return Object.fromEntries((await req.formData()).entries());
  }
  return req.json();
}

function splitName(name?: string) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
  };
}

function buildIdempotencyKey(
  data: z.infer<typeof postPurchaseSchema>,
) {
  if (data.idempotencyKey) return data.idempotencyKey;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        email: data.email.trim().toLowerCase(),
        productLine: data.productLine,
        addOnPurchased: data.addOnPurchased ?? null,
      }),
    )
    .digest("hex");
  return `ghl-post-purchase:${data.locationId}:${data.contactId}:${digest}`;
}

export async function POST(req: NextRequest) {
  const rateLimit = await webhookLimiter.limit(getClientIp(req));
  if (!rateLimit.success) return rateLimitResponse(rateLimit);

  let body: unknown;
  try {
    body = await parseBody(req);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = postPurchaseSchema.safeParse(
    canonicalizePostPurchasePayload(body as Record<string, unknown>),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [location] = await db
    .select({ webhookSecret: ghlLocations.webhookSecret })
    .from(ghlLocations)
    .where(eq(ghlLocations.ghlLocationId, data.locationId))
    .limit(1);
  if (!location) {
    return NextResponse.json({ error: "Unknown location" }, { status: 403 });
  }
  const suppliedSecret = req.headers.get("x-webhook-secret");
  if (!webhookSecretsMatch(suppliedSecret, location.webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyKey = buildIdempotencyKey(data);
  const existing = await db.query.processedWebhooks.findFirst({
    where: eq(processedWebhooks.idempotencyKey, idempotencyKey),
  });
  if (existing) {
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  const inferredName = splitName(data.name);
  try {
    const result = await provisionPostPurchaseEntitlements({
      email: data.email,
      firstName: data.firstName ?? inferredName.firstName,
      lastName: data.lastName ?? inferredName.lastName,
      productLine: data.productLine,
      addOnPurchased: data.addOnPurchased,
      ghlContactId: data.contactId,
      ghlLocationId: data.locationId,
    });

    await db
      .insert(processedWebhooks)
      .values({
        idempotencyKey,
        source: "ghl-post-purchase",
        eventType: "entitlement_reconciliation",
        payload: {
          contactId: data.contactId,
          locationId: data.locationId,
          productLine: data.productLine,
          addOnPurchased: data.addOnPurchased ?? null,
        },
        result: "success",
        resultData: {
          userId: result.userId,
          action: result.action,
          invitation: result.invitation,
          expectedTags: result.expectedTags,
          tagsAdded: result.tagsAdded,
          tagsRemoved: result.tagsRemoved,
        },
      })
      .onConflictDoNothing();

    await logSyncEvent({
      eventType: "post_purchase.entitlements_provisioned",
      direction: "inbound",
      entityType: "post_purchase",
      entityId: result.userId,
      ghlContactId: data.contactId,
      payload: {
        locationId: data.locationId,
        action: result.action,
        invitation: result.invitation,
        expectedTags: result.expectedTags,
        tagsAdded: result.tagsAdded,
        tagsRemoved: result.tagsRemoved,
      },
    }).catch(() => {
      console.error("[Post Purchase] Failed to log successful provisioning");
    });

    return NextResponse.json({
      success: true,
      action: result.action,
      invitation: result.invitation,
      expectedTags: result.expectedTags,
      tagsAdded: result.tagsAdded,
      tagsRemoved: result.tagsRemoved,
    });
  } catch (error) {
    console.error(
      "[Post Purchase] Provisioning failed:",
      error instanceof Error ? error.message : error,
    );
    await logSyncEvent({
      eventType: "post_purchase.entitlements_provisioned",
      direction: "inbound",
      entityType: "post_purchase",
      ghlContactId: data.contactId,
      payload: { locationId: data.locationId },
      status: "failed",
    }).catch(() => {
      console.error("[Post Purchase] Failed to log provisioning failure");
    });
    return NextResponse.json(
      { error: "Provisioning failed" },
      { status: 500 },
    );
  }
}
