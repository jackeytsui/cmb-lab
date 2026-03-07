import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { assessmentAttempts, assessmentQuestions } from "@/db/schema";
import {
  gradeFillInBlank,
  gradeMatching,
  gradeMultipleChoice,
  gradeOrdering,
} from "@/lib/practice-grading";

function safeSection(sectionScores: Record<string, number>, key: string) {
  return sectionScores[key] ?? 0;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId } = await params;
  const attempts = await db.query.assessmentAttempts.findMany({
    where: and(eq(assessmentAttempts.assessmentId, assessmentId), eq(assessmentAttempts.userId, user.id)),
  });

  return NextResponse.json({ attempts });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId } = await params;
  const body = (await request.json()) as {
    answers?: Record<string, unknown>;
  };

  const questions = await db.query.assessmentQuestions.findMany({
    where: eq(assessmentQuestions.assessmentId, assessmentId),
  });

  if (!body.answers || !questions.length) {
    return NextResponse.json({ error: "answers and questions are required" }, { status: 400 });
  }

  let earned = 0;
  const total = questions.length;
  const sectionScores: Record<string, number> = {};
  const sectionCounts: Record<string, number> = {};

  for (const q of questions) {
    const answer = body.answers[q.id] as unknown;
    const definition = q.definition as Record<string, unknown>;
    let score = 0;

    try {
      if (q.type === "multiple_choice") {
        score = gradeMultipleChoice(String(answer ?? ""), definition as never).score;
      } else if (q.type === "fill_in_blank") {
        score = gradeFillInBlank(Array.isArray(answer) ? answer.map(String) : [], definition as never).score;
      } else if (q.type === "matching") {
        score = gradeMatching(Array.isArray(answer) ? (answer as never) : [], definition as never).score;
      } else if (q.type === "ordering") {
        score = gradeOrdering(Array.isArray(answer) ? answer.map(String) : [], definition as never).score;
      } else {
        score = 50;
      }
    } catch {
      score = 0;
    }

    earned += score;
    sectionScores[q.skillArea] = safeSection(sectionScores, q.skillArea) + score;
    sectionCounts[q.skillArea] = (sectionCounts[q.skillArea] ?? 0) + 1;
  }

  Object.keys(sectionScores).forEach((key) => {
    sectionScores[key] = Math.round(sectionScores[key] / Math.max(1, sectionCounts[key]));
  });

  const finalScore = Math.round(earned / Math.max(1, total));
  const estimatedHskLevel =
    finalScore >= 90 ? 6 :
    finalScore >= 80 ? 5 :
    finalScore >= 70 ? 4 :
    finalScore >= 60 ? 3 :
    finalScore >= 50 ? 2 : 1;

  const [attempt] = await db
    .insert(assessmentAttempts)
    .values({
      assessmentId,
      userId: user.id,
      score: finalScore,
      sectionScores,
      estimatedHskLevel,
      answers: body.answers,
    })
    .returning();

  return NextResponse.json({ attempt, estimatedHskLevel, sectionScores });
}
