import { NextResponse } from "next/server";
import { reconcilePostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const resyncGhl = url.searchParams.get("resyncGhl") === "true";
  const result = await reconcilePostPurchaseEntitlements({ dryRun, resyncGhl });
  await logSyncEvent({
    eventType: "post_purchase.entitlements_reconciled",
    direction: "outbound",
    entityType: "post_purchase",
    payload: { trigger: "cron", dryRun, resyncGhl, ...result },
    status: result.failed > 0 ? "failed" : "completed",
  }).catch(() => {
    console.error("[Post Purchase] Failed to log scheduled reconciliation");
  });
  return NextResponse.json(result, { status: result.failed > 0 ? 207 : 200 });
}
