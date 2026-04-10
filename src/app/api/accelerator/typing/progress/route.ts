import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { typingProgress } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET — fetch completed sentence IDs for the current user
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        sentenceId: typingProgress.sentenceId,
        skipped: typingProgress.skipped,
      })
      .from(typingProgress)
      .where(eq(typingProgress.userId, user.id));

    const completedIds = rows.map((r) => r.sentenceId);
    const skippedIds = rows.filter((r) => r.skipped).map((r) => r.sentenceId);
    return NextResponse.json({ completedIds, skippedIds });
  } catch (error) {
    console.error("Failed to fetch typing progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — mark a sentence as completed (optionally as skipped)
// ---------------------------------------------------------------------------

const markCompleteSchema = z.object({
  sentenceId: z.string().uuid(),
  skipped: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = markCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const skipped = parsed.data.skipped ?? false;

    // Upsert with skipped flag. If the row already exists, update the skipped
    // flag so that a correct answer after a give-up clears the skipped state.
    await db
      .insert(typingProgress)
      .values({
        userId: user.id,
        sentenceId: parsed.data.sentenceId,
        skipped,
      })
      .onConflictDoUpdate({
        target: [typingProgress.userId, typingProgress.sentenceId],
        set: {
          skipped,
          completedAt: sql`now()`,
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to record typing progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a sentence from progress (deduct when student clicks Try Again)
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = markCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db
      .delete(typingProgress)
      .where(
        and(
          eq(typingProgress.userId, user.id),
          eq(typingProgress.sentenceId, parsed.data.sentenceId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove typing progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
