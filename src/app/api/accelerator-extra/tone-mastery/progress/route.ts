import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { toneMasteryProgress } from "@/db/schema";
import { z } from "zod";

const ratingSchema = z.object({
  clipId: z.string().uuid(),
  selfRating: z.enum(["good", "not_good"]),
});

/**
 * POST /api/accelerator-extra/tone-mastery/progress
 * Upsert self-rating for a tone mastery clip.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = ratingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clipId, selfRating } = parsed.data;

    await db
      .insert(toneMasteryProgress)
      .values({
        userId: user.id,
        clipId,
        selfRating,
      })
      .onConflictDoUpdate({
        target: [toneMasteryProgress.userId, toneMasteryProgress.clipId],
        set: {
          selfRating,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving tone mastery progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 },
    );
  }
}
