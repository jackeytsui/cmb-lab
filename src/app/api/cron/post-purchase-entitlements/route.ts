import { NextResponse } from "next/server";
import { reconcilePostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { reconcileMissingCoachAssignments } from "@/lib/ghl/coach-assignment";

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
  const coachAssignments = await reconcileMissingCoachAssignments({ dryRun });
  // Resolve GHL coach fields first so the entitlement pass can grant 1:1
  // access only to students with a real CMB coach assignment.
  const result = await reconcilePostPurchaseEntitlements({ dryRun, resyncGhl });
  await logSyncEvent({
    eventType: "post_purchase.entitlements_reconciled",
    direction: "outbound",
    entityType: "post_purchase",
    payload: {
      trigger: "cron",
      dryRun,
      resyncGhl,
      ...result,
      coachAssignments,
    },
    status:
      result.failed > 0 || (coachAssignments.statuses.failed ?? 0) > 0
        ? "failed"
        : "completed",
  }).catch(() => {
    console.error("[Post Purchase] Failed to log scheduled reconciliation");
  });
  const failed = result.failed + (coachAssignments.statuses.failed ?? 0);
  return NextResponse.json(
    { ...result, coachAssignments },
    { status: failed > 0 ? 207 : 200 },
  );
}
