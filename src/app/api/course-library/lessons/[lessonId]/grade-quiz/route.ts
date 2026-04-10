import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  answers: z.record(z.string(), z.array(z.string())),
});

interface StoredQuestion {
  id: string;
  prompt: string;
  type: "single" | "multiple" | "true_false";
  options: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  explanation?: string;
  points: number;
}

/**
 * POST /api/course-library/lessons/[lessonId]/grade-quiz
 * Grades a quiz submission against the stored correct answers.
 * Body: { answers: { [questionId]: string[] } }
 * Returns: { score, passed, passingScore, perQuestion: [...] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [lesson] = await db
    .select()
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .limit(1);

  if (!lesson || lesson.lessonType !== "quiz") {
    return NextResponse.json(
      { error: "Quiz lesson not found" },
      { status: 404 },
    );
  }

  const content = (lesson.content ?? {}) as {
    passingScore?: number;
    questions?: StoredQuestion[];
  };
  const questions = content.questions ?? [];
  const passingScore = content.passingScore ?? 70;

  let earned = 0;
  let total = 0;
  const perQuestion: Array<{
    questionId: string;
    correct: boolean;
    pointsEarned: number;
    points: number;
    correctOptionIds: string[];
    explanation?: string;
  }> = [];

  for (const q of questions) {
    total += q.points;
    const given = parsed.data.answers[q.id] ?? [];
    const correctSet = new Set(q.correctOptionIds);
    const givenSet = new Set(given);

    // Correct if both sets match exactly
    let isCorrect = correctSet.size === givenSet.size;
    if (isCorrect) {
      for (const id of correctSet) {
        if (!givenSet.has(id)) {
          isCorrect = false;
          break;
        }
      }
    }

    const pointsEarned = isCorrect ? q.points : 0;
    earned += pointsEarned;
    perQuestion.push({
      questionId: q.id,
      correct: isCorrect,
      pointsEarned,
      points: q.points,
      correctOptionIds: q.correctOptionIds,
      explanation: q.explanation,
    });
  }

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const passed = score >= passingScore;

  return NextResponse.json({
    score,
    passed,
    passingScore,
    earned,
    total,
    perQuestion,
  });
}
