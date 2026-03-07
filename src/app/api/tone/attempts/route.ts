import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { tonePracticeAttempts } from "@/db/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attempts = await db.query.tonePracticeAttempts.findMany({
    where: eq(tonePracticeAttempts.userId, user.id),
    orderBy: [desc(tonePracticeAttempts.createdAt)],
    limit: 200,
  });

  const byTone = new Map<number, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const tone = attempt.expectedTone ?? 0;
    const bucket = byTone.get(tone) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (attempt.isCorrect) bucket.correct += 1;
    byTone.set(tone, bucket);
  }

  const toneAccuracy = Array.from(byTone.entries())
    .map(([tone, value]) => ({
      tone,
      accuracy: value.total > 0 ? Math.round((value.correct / value.total) * 100) : 0,
      attempts: value.total,
    }))
    .sort((a, b) => a.tone - b.tone);

  return NextResponse.json({ attempts, toneAccuracy });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    language?: "mandarin" | "cantonese";
    type?: "identification" | "production" | "minimal_pair" | "sandhi";
    prompt?: string;
    expectedTone?: number;
    selectedTone?: number;
    score?: number;
    feedback?: string;
  };

  if (!body.prompt?.trim() || !body.language || !body.type) {
    return NextResponse.json({ error: "language, type, and prompt are required" }, { status: 400 });
  }

  const isCorrect =
    body.expectedTone && body.selectedTone
      ? Number(body.expectedTone === body.selectedTone)
      : Number((body.score ?? 0) >= 70);

  const [attempt] = await db
    .insert(tonePracticeAttempts)
    .values({
      userId: user.id,
      language: body.language,
      type: body.type,
      prompt: body.prompt,
      expectedTone: body.expectedTone ?? null,
      selectedTone: body.selectedTone ?? null,
      score: body.score ?? (isCorrect ? 100 : 0),
      isCorrect,
      feedback: body.feedback ?? null,
    })
    .returning();

  return NextResponse.json({ attempt }, { status: 201 });
}
