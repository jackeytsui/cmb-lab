import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { getVocalHackWorkflowStatus } from "@/lib/videoask/vocal-hack-workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getVocalHackWorkflowStatus());
}
