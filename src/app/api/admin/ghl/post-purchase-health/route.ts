import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { processedWebhooks } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { reconcilePostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";

const repairSchema = z.object({
  resyncGhl: z.boolean().default(false),
});

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getWebhookEvidence() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [[summary], [latest]] = await Promise.all([
    db
      .select({ total: count() })
      .from(processedWebhooks)
      .where(
        and(
          eq(processedWebhooks.source, "ghl-post-purchase"),
          gte(processedWebhooks.processedAt, thirtyDaysAgo),
        ),
      ),
    db
      .select({ processedAt: processedWebhooks.processedAt })
      .from(processedWebhooks)
      .where(eq(processedWebhooks.source, "ghl-post-purchase"))
      .orderBy(desc(processedWebhooks.processedAt))
      .limit(1),
  ]);
  return {
    webhooksLast30d: summary?.total ?? 0,
    lastWebhookAt: latest?.processedAt ?? null,
  };
}

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [result, webhookEvidence] = await Promise.all([
    reconcilePostPurchaseEntitlements({
      dryRun: true,
      resyncGhl: false,
    }),
    getWebhookEvidence(),
  ]);
  return NextResponse.json({ dryRun: true, ...webhookEvidence, ...result });
}

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = repairSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await reconcilePostPurchaseEntitlements({
    dryRun: false,
    resyncGhl: parsed.data.resyncGhl,
  });
  await logSyncEvent({
    eventType: "post_purchase.entitlements_reconciled",
    direction: "outbound",
    entityType: "post_purchase",
    payload: { trigger: "admin", ...result },
    status: result.failed > 0 ? "failed" : "completed",
  }).catch(() => {
    console.error("[Post Purchase] Failed to log admin reconciliation");
  });

  return NextResponse.json(
    { dryRun: false, ...result },
    { status: result.failed > 0 ? 207 : 200 },
  );
}
