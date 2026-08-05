import { NextResponse } from "next/server";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { processNextVideoAskMedia } from "@/lib/videoask/importer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    return NextResponse.json({ result: await processNextVideoAskMedia(user) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Media transfer failed";
    console.error("[videoask/media-import] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
