import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { reconcilePostPurchaseEntitlements } from "@/lib/post-purchase-provisioning";

/**
 * Legacy route retained for operational compatibility. Coaching tags are
 * purchase entitlements, so repair them from the post-purchase source of truth
 * instead of granting both coaching packages to every active student.
 */
export async function POST() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await reconcilePostPurchaseEntitlements({
    dryRun: false,
    resyncGhl: false,
  });
  return NextResponse.json({
    source: "post_purchase_entitlements",
    ...result,
  }, { status: result.failed > 0 ? 207 : 200 });
}
