import { NextResponse } from "next/server";
import { reconcilePostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";

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
  return NextResponse.json(result, { status: result.failed > 0 ? 207 : 200 });
}
