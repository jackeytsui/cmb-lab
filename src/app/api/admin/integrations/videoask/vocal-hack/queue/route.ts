import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { queueVocalHackTranscription } from "@/lib/videoask/vocal-hack-workflow";

const queueSchema = z.object({
  mode: z.enum(["safe", "all_mapped"]).optional(),
  placementIds: z.array(z.string().uuid()).max(150).optional(),
});

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = queueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid queue request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return NextResponse.json({
    result: await queueVocalHackTranscription(parsed.data),
  });
}
