import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { publishVocalHackPlacement } from "@/lib/videoask/vocal-hack-workflow";

const publishSchema = z.object({ confirm: z.literal(true) });

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
  const parsed = publishSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Explicit publish confirmation is required" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      result: await publishVocalHackPlacement(placementId, user.id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not publish Vocal Hack";
    console.error("[videoask/vocal-hack/publish]", error);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
