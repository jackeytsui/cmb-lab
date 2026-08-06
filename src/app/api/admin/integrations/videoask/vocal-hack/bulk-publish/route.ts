import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { publishReadyStrongVocalHackPlacements } from "@/lib/videoask/vocal-hack-workflow";

export const maxDuration = 60;

const requestSchema = z.object({
  confirm: z.literal(true),
  limit: z.number().int().min(1).max(25).default(10),
});

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getRealUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Explicit bulk-publish confirmation is required" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      result: await publishReadyStrongVocalHackPlacements(
        user.id,
        parsed.data.limit,
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not publish Vocal Hacks";
    console.error("[videoask/vocal-hack/bulk-publish]", error);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
