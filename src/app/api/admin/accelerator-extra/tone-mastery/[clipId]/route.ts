import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { toneMasteryClips } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  pinyin: z.string().min(1).optional(),
  chinese: z.string().min(1).optional(),
  videoUrl: z.string().min(1).optional(),
  groupNumber: z.number().int().min(1).optional(),
  itemNumber: z.number().int().min(1).optional(),
  variant: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * PUT /api/admin/accelerator-extra/tone-mastery/[clipId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clipId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(toneMasteryClips)
    .set(parsed.data)
    .where(eq(toneMasteryClips.id, clipId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ clip: updated });
}

/**
 * DELETE /api/admin/accelerator-extra/tone-mastery/[clipId]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clipId } = await params;

  await db
    .delete(toneMasteryClips)
    .where(eq(toneMasteryClips.id, clipId));

  return new NextResponse(null, { status: 204 });
}
