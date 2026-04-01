import { NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

/**
 * GET /api/admin/accelerator/settings/upload/auth
 * Internal auth check called by the Edge upload route.
 */
export async function GET() {
  try {
    const hasRoleAccess = await hasMinimumRole("coach");
    if (hasRoleAccess) {
      return NextResponse.json({ ok: true });
    }
    const user = await getCurrentUser();
    if (user) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }
}
