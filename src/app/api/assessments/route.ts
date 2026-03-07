import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { assessmentQuestions, assessments } from "@/db/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.assessments.findMany({
    orderBy: [asc(assessments.type), asc(assessments.hskLevel), asc(assessments.title)],
  });

  return NextResponse.json({ assessments: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    type?: "placement" | "hsk_mock" | "custom";
    hskLevel?: number;
    passThreshold?: number;
    questions?: Array<{
      skillArea?: string;
      difficulty?: number;
      prompt: string;
      type: string;
      definition: Record<string, unknown>;
    }>;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [assessment] = await db
    .insert(assessments)
    .values({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      type: body.type ?? "custom",
      hskLevel: body.hskLevel ?? null,
      passThreshold: body.passThreshold ?? 70,
      createdBy: user.id,
    })
    .returning();

  if (body.questions?.length) {
    await db.insert(assessmentQuestions).values(
      body.questions.map((question, idx) => ({
        assessmentId: assessment.id,
        skillArea: question.skillArea ?? "vocabulary",
        difficulty: question.difficulty ?? 1,
        prompt: question.prompt,
        type: question.type,
        definition: question.definition,
        sortOrder: idx,
      }))
    );
  }

  return NextResponse.json({ assessment }, { status: 201 });
}
