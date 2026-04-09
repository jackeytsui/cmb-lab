import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { listeningQuestions, listeningProgress, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

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
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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

  const completedIds = progress.map((p) => p.questionId);

  return NextResponse.json({ questions, completedIds });
}
