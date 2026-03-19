import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, practiceAttempts } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getLessonPracticeSet, listExercises } from "@/lib/practice";
import { lessons } from "@/db/schema";

/**
 * GET /api/audio-courses/exercises/[lessonId]
 * Returns published exercises for a lesson, with the student's completion status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  // Verify lesson exists
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { id: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  // Get the practice set for this lesson
  const practiceSet = await getLessonPracticeSet(lessonId);
  if (!practiceSet || practiceSet.status !== "published") {
    return NextResponse.json({
      practiceSetId: null,
      exercises: [],
      hasExercises: false,
      bestScore: null,
      attemptCount: 0,
    });
  }

  const exercises = await listExercises(practiceSet.id);
  if (exercises.length === 0) {
    return NextResponse.json({
      practiceSetId: practiceSet.id,
      exercises: [],
      hasExercises: false,
      bestScore: null,
      attemptCount: 0,
    });
  }

  // Get student's attempt info
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });

  let bestScore: number | null = null;
  let attemptCount = 0;

  if (dbUser) {
    const attempts = await db
      .select({
        score: practiceAttempts.score,
        completedAt: practiceAttempts.completedAt,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.practiceSetId, practiceSet.id),
          eq(practiceAttempts.userId, dbUser.id),
        ),
      );

    attemptCount = attempts.length;
    for (const attempt of attempts) {
      if (attempt.completedAt && attempt.score !== null) {
        if (bestScore === null || attempt.score > bestScore) {
          bestScore = attempt.score;
        }
      }
    }
  }

  return NextResponse.json({
    practiceSetId: practiceSet.id,
    practiceSetTitle: practiceSet.title,
    exercises,
    hasExercises: true,
    bestScore,
    attemptCount,
  });
}
