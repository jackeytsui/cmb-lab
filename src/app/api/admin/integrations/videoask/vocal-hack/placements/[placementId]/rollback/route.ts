import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { rollbackVocalHackPlacement } from "@/lib/videoask/vocal-hack-workflow";

const rollbackSchema = z.object({ confirm: z.literal(true) });

interface RouteParams {
  params: Promise<{ placementId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getRealUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { placementId } = await params;
  if (!z.string().uuid().safeParse(placementId).success) {
    return NextResponse.json({ error: "Invalid placement ID" }, { status: 400 });
  }
  if (
    !rollbackSchema.safeParse(await request.json().catch(() => null)).success
  ) {
    return NextResponse.json(
      { error: "Explicit rollback confirmation is required" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      result: await rollbackVocalHackPlacement(placementId, user.id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not roll back Vocal Hack";
    console.error("[videoask/vocal-hack/rollback]", error);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
