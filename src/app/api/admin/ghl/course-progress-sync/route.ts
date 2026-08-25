import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { syncGhlCourseProgress } from "@/lib/ghl/course-progress-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { apply?: boolean };
  const result = await syncGhlCourseProgress({ apply: body.apply === true });
  return NextResponse.json(result, { status: result.configured ? 200 : 409 });
}
