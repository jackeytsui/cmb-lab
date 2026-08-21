import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { listeningProgress, listeningQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userCanUseFeature } from "@/lib/feature-access";

const progressSchema = z.object({
  questionId: z.string().uuid(),
});

/**
 * POST /api/accelerator-extra/listening-training/progress
 * Mark a listening question as completed.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "listening_training"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const question = await db.query.listeningQuestions.findFirst({
      where: eq(listeningQuestions.id, parsed.data.questionId),
      columns: { id: true },
    });
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    await db
      .insert(listeningProgress)
      .values({
        userId: user.id,
        questionId: parsed.data.questionId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving listening progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 },
    );
  }
}
