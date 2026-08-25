import { NextResponse } from "next/server";
import { syncGhlCourseProgress } from "@/lib/ghl/course-progress-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncGhlCourseProgress({ apply: true });
  return NextResponse.json(result, { status: result.configured ? 200 : 409 });
}
