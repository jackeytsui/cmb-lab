import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { practiceAttempts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getLessonPracticeSet, listExercises } from "@/lib/practice";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAudioLesson } from "@/lib/audio-course-lesson-access";

/**
 * GET /api/audio-courses/exercises/[lessonId]
 * Returns published exercises for a lesson, with the student's completion status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const dbUser = await getCurrentUser();
  if (!dbUser || dbUser.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!(await getAccessibleAudioLesson(dbUser, lessonId))) {
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

  let bestScore: number | null = null;
  let attemptCount = 0;

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

  return NextResponse.json({
    practiceSetId: practiceSet.id,
    practiceSetTitle: practiceSet.title,
    exercises,
    hasExercises: true,
    bestScore,
    attemptCount,
  });
}
