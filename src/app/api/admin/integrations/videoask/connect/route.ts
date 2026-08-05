import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  getVideoAskAuthorizationUrl,
  VIDEOASK_OAUTH_STATE_COOKIE,
} from "@/lib/videoask/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const state = randomBytes(32).toString("base64url");
    const cookieStore = await cookies();
    cookieStore.set(VIDEOASK_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/api/admin/integrations/videoask",
    });

    return NextResponse.redirect(getVideoAskAuthorizationUrl(state));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "VideoAsk connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
