import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { toneMasteryClips } from "@/db/schema";
import { asc } from "drizzle-orm";
import { z } from "zod";

/**
 * GET /api/admin/accelerator-extra/tone-mastery
 * Returns all tone mastery clips.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clips = await db
    .select()
    .from(toneMasteryClips)
    .orderBy(asc(toneMasteryClips.sortOrder), asc(toneMasteryClips.groupNumber));

  return NextResponse.json({ clips });
}

const createSchema = z.object({
  title: z.string().min(1),
  pinyin: z.string().min(1),
  chinese: z.string().min(1),
  videoUrl: z.string().min(1),
  groupNumber: z.number().int().min(1),
  itemNumber: z.number().int().min(1),
  variant: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

/**
 * POST /api/admin/accelerator-extra/tone-mastery
 * Create a new tone mastery clip.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [clip] = await db
    .insert(toneMasteryClips)
    .values({
      ...parsed.data,
      sortOrder: parsed.data.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json({ clip }, { status: 201 });
}
