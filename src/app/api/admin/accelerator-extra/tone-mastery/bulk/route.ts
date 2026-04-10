import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { toneMasteryClips } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const bulkClipSchema = z.object({
  title: z.string().min(1, "English title required"),
  pinyin: z.string().min(1, "Pinyin required"),
  chinese: z.string().min(1, "Chinese required"),
  groupNumber: z.number().int().min(1),
  itemNumber: z.number().int().min(1),
  variant: z.string().min(1).max(2),
  sortOrder: z.number().int().optional(),
});

const bulkSchema = z.object({
  clips: z.array(bulkClipSchema).min(1).max(500),
});

/**
 * POST /api/admin/accelerator-extra/tone-mastery/bulk
 * Batch create tone mastery clips as placeholders (videoUrl="placeholder").
 * Skips rows that already exist with the same (group, item, variant).
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Fetch all existing (group, item, variant) tuples to detect duplicates
  const existing = await db
    .select({
      groupNumber: toneMasteryClips.groupNumber,
      itemNumber: toneMasteryClips.itemNumber,
      variant: toneMasteryClips.variant,
    })
    .from(toneMasteryClips);

  const existingKeys = new Set(
    existing.map((r) => `${r.groupNumber}-${r.itemNumber}-${r.variant.toUpperCase()}`),
  );

  const toInsert: (typeof toneMasteryClips.$inferInsert)[] = [];
  const skipped: string[] = [];

  for (const clip of parsed.data.clips) {
    const variantUpper = clip.variant.toUpperCase();
    const key = `${clip.groupNumber}-${clip.itemNumber}-${variantUpper}`;

    if (existingKeys.has(key)) {
      skipped.push(key);
      continue;
    }

    // Auto-calculate sort order if not provided:
    // Group * 100 + Item * 10 + Variant index (A=1, B=2, C=3, etc.)
    const variantIndex = variantUpper.charCodeAt(0) - 64; // A=1, B=2, ...
    const defaultSort =
      clip.groupNumber * 100 + clip.itemNumber * 10 + variantIndex;

    toInsert.push({
      title: clip.title,
      pinyin: clip.pinyin,
      chinese: clip.chinese,
      videoUrl: "placeholder",
      groupNumber: clip.groupNumber,
      itemNumber: clip.itemNumber,
      variant: variantUpper,
      sortOrder: clip.sortOrder ?? defaultSort,
    });

    // Track the new key so multiple rows in the same payload can't collide
    existingKeys.add(key);
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: skipped.length,
      skippedKeys: skipped,
      message: "All rows already exist — nothing to import.",
    });
  }

  await db.insert(toneMasteryClips).values(toInsert);

  return NextResponse.json({
    imported: toInsert.length,
    skipped: skipped.length,
    skippedKeys: skipped,
  });
}
