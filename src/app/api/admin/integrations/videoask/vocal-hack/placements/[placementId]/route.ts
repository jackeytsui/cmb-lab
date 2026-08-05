import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import {
  getVocalHackPlacementDetail,
  updateVocalHackPlacement,
} from "@/lib/videoask/vocal-hack-workflow";

const updateSchema = z
  .object({
    targetCourseId: z.string().uuid().nullable().optional(),
    targetModuleId: z.string().uuid().nullable().optional(),
    targetLessonId: z.string().uuid().nullable().optional(),
    targetLessonTitle: z.string().max(200).nullable().optional(),
    instructions: z.string().max(20_000).optional(),
    sentences: z
      .array(
        z.object({
          id: z.string().uuid(),
          chinese: z.string().max(2_000),
          pinyin: z.string().max(4_000),
          english: z.string().max(4_000),
        }),
      )
      .max(200)
      .optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((field) => field !== undefined),
    "At least one review field is required",
  );

interface RouteParams {
  params: Promise<{ placementId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { placementId } = await params;
  if (!z.string().uuid().safeParse(placementId).success) {
    return NextResponse.json({ error: "Invalid placement ID" }, { status: 400 });
  }
  const detail = await getVocalHackPlacementDetail(placementId);
  if (!detail) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { placementId } = await params;
  if (!z.string().uuid().safeParse(placementId).success) {
    return NextResponse.json({ error: "Invalid placement ID" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review update", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const detail = await updateVocalHackPlacement(placementId, parsed.data);
    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save review";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
