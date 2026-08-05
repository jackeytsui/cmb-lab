import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { processNextVocalHackSentence } from "@/lib/videoask/vocal-hack-workflow";

export const maxDuration = 60;

const processSchema = z.object({
  placementId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const parsed = processSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid process request" }, { status: 400 });
    }
    return NextResponse.json({
      result: await processNextVocalHackSentence(parsed.data.placementId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI transcription failed";
    console.error("[videoask/vocal-hack/process]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
