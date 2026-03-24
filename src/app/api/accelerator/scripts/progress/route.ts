import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  scriptLineProgress,
  scriptLines,
} from "@/db/schema/accelerator";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET — fetch self-ratings for the current user
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get("scriptId");

    let ratings;

    if (scriptId) {
      // Filter to lines belonging to a specific script
      ratings = await db
        .select({
          lineId: scriptLineProgress.lineId,
          selfRating: scriptLineProgress.selfRating,
        })
        .from(scriptLineProgress)
        .innerJoin(scriptLines, eq(scriptLineProgress.lineId, scriptLines.id))
        .where(
          and(
            eq(scriptLineProgress.userId, user.id),
            eq(scriptLines.scriptId, scriptId)
          )
        );
    } else {
      ratings = await db
        .select({
          lineId: scriptLineProgress.lineId,
          selfRating: scriptLineProgress.selfRating,
        })
        .from(scriptLineProgress)
        .where(eq(scriptLineProgress.userId, user.id));
    }

    return NextResponse.json({ ratings });
  } catch (error) {
    console.error("Error fetching script progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — upsert a self-rating for a line
// ---------------------------------------------------------------------------

const ratingSchema = z.object({
  lineId: z.string().uuid(),
  selfRating: z.enum(["good", "not_good"]),
});

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
        { status: 400 }
      );
    }

    const { lineId, selfRating } = parsed.data;

    await db
      .insert(scriptLineProgress)
      .values({
        userId: user.id,
        lineId,
        selfRating,
      })
      .onConflictDoUpdate({
        target: [scriptLineProgress.userId, scriptLineProgress.lineId],
        set: {
          selfRating,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving script progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
