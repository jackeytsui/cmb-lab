import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { typingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
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
      .select({ sentenceId: typingProgress.sentenceId })
      .from(typingProgress)
      .where(eq(typingProgress.userId, user.id));

    const completedIds = rows.map((r) => r.sentenceId);
    return NextResponse.json({ completedIds });
  } catch (error) {
    console.error("Failed to fetch typing progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — mark a sentence as completed
// ---------------------------------------------------------------------------

const markCompleteSchema = z.object({
  sentenceId: z.string().uuid(),
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

    // Upsert: ignore if already completed (unique index on userId+sentenceId)
    await db
      .insert(typingProgress)
      .values({
        userId: user.id,
        sentenceId: parsed.data.sentenceId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to record typing progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
