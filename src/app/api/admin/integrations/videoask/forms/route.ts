import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { listAllVideoAskForms } from "@/lib/videoask/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const forms = await listAllVideoAskForms();
    return NextResponse.json({ count: forms.length, forms });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not scan VideoAsk";
    console.error("[videoask/forms] Scan failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
