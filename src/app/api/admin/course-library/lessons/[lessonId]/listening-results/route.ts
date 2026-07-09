import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryLessonProgress,
  users,
} from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import type { CourseLibraryListeningPracticeSentence } from "@/db/schema/course-library";
import { isListeningPracticeLesson } from "@/lib/lesson-language";

/**
 * GET /api/admin/course-library/lessons/[lessonId]/listening-results
 *
 * Staff view of auto-checked Listening Practice results: every student who has
 * attempted the lesson, with their score and per-sentence breakdown. Coach+.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  if (!(await hasMinimumRole("coach"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { lessonId } = await params;

  const [lesson] = await db
    .select({
      content: courseLibraryLessons.content,
      lessonType: courseLibraryLessons.lessonType,
    })
    .from(courseLibraryLessons)
    .where(eq(courseLibraryLessons.id, lessonId))
    .limit(1);

  if (!lesson || !isListeningPracticeLesson(lesson.lessonType)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const content = (lesson.content ?? {}) as Record<string, unknown>;
  const sentences = Array.isArray(content.sentences)
    ? (content.sentences as CourseLibraryListeningPracticeSentence[])
    : [];
  const total = sentences.length;

  const rows = await db
    .select({
      userId: courseLibraryLessonProgress.userId,
      name: users.name,
      email: users.email,
      score: courseLibraryLessonProgress.quizScore,
      answers: courseLibraryLessonProgress.quizAnswers,
      completedAt: courseLibraryLessonProgress.completedAt,
      updatedAt: courseLibraryLessonProgress.updatedAt,
    })
    .from(courseLibraryLessonProgress)
    .innerJoin(users, eq(users.id, courseLibraryLessonProgress.userId))
    .where(
      and(
        eq(courseLibraryLessonProgress.lessonId, lessonId),
        isNotNull(courseLibraryLessonProgress.quizScore),
      ),
    )
    .orderBy(desc(courseLibraryLessonProgress.updatedAt));

  const results = rows.map((r) => {
    const answers =
      (r.answers as Record<string, { status: string; attempts: number }> | null) ??
      {};
    let correct = 0;
    let resolved = 0;
    for (const s of sentences) {
      const entry = answers[s.id];
      if (!entry) continue;
      if (entry.status === "correct") {
        correct += 1;
        resolved += 1;
      } else if (entry.status === "gaveup") {
        resolved += 1;
      }
    }
    return {
      userId: r.userId,
      name: r.name,
      email: r.email,
      score: r.score ?? 0,
      correct,
      resolved,
      total,
      completedAt: r.completedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ total, results });
}
