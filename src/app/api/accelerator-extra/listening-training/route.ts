import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { listeningQuestions, listeningProgress, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { userCanUseFeature } from "@/lib/feature-access";

/**
 * GET /api/accelerator-extra/listening-training
 * Returns all 30 listening questions + user's completed question IDs.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!(await userCanUseFeature(dbUser, "listening_training"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [questions, progress] = await Promise.all([
    db
      .select()
      .from(listeningQuestions)
      .orderBy(asc(listeningQuestions.sortOrder)),
    db
      .select({ questionId: listeningProgress.questionId })
      .from(listeningProgress)
      .where(eq(listeningProgress.userId, dbUser.id)),
  ]);

  // Older seed runs could insert the same numbered question more than once.
  // Return one canonical question per slot so the test remains 30 questions.
  const uniqueQuestions = Array.from(
    new Map(questions.map((question) => [question.sortOrder, question])).values(),
  );
  const completedIds = progress.map((p) => p.questionId);

  return NextResponse.json({ questions: uniqueQuestions, completedIds });
}
