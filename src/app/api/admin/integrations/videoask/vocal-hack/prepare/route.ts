import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { prepareVocalHackPlacements } from "@/lib/videoask/vocal-hack-workflow";

export const maxDuration = 60;

export async function POST() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ result: await prepareVocalHackPlacements() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not prepare Vocal Hacks";
    console.error("[videoask/vocal-hack/prepare]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
