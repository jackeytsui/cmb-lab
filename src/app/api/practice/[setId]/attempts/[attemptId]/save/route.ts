import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { practiceAttempts, practiceExercises, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { canUserAccessPracticeSet } from "@/lib/assignments";

// POST /api/practice/[setId]/attempts/[attemptId]/save
// Auto-save a single answer to an active attempt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string; attemptId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { setId, attemptId } = await params;
  const { exerciseId, response } = await request.json();

  if (!exerciseId || response === undefined) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!(await canUserAccessPracticeSet(currentUser.id, setId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const exercise = await db.query.practiceExercises.findFirst({
    where: and(
      eq(practiceExercises.id, exerciseId),
      eq(practiceExercises.practiceSetId, setId),
      isNull(practiceExercises.deletedAt),
    ),
    columns: { id: true },
  });
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  try {
    // Upsert the answer into the JSONB 'answers' column
    // Using jsonb_set to merge or update the specific key
    const [updated] = await db
      .update(practiceAttempts)
      .set({
        answers: sql`jsonb_set(
          COALESCE(${practiceAttempts.answers}, '{}'::jsonb),
          array[${exerciseId}],
          ${JSON.stringify(response)}::jsonb
        )`,
      })
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.practiceSetId, setId),
          eq(practiceAttempts.userId, currentUser.id),
          isNull(practiceAttempts.completedAt),
        )
      )
      .returning({ id: practiceAttempts.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Attempt not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to auto-save answer:", error);
    return NextResponse.json(
      { error: "Failed to save answer" },
      { status: 500 }
    );
  }
}
