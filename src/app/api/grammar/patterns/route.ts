import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { grammarPatterns } from "@/db/schema";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const hsk = request.nextUrl.searchParams.get("hsk");
  const category = request.nextUrl.searchParams.get("category")?.trim();
  const includeDrafts = request.nextUrl.searchParams.get("includeDrafts") === "1";

  const clauses = [];
  if (!includeDrafts) clauses.push(eq(grammarPatterns.status, "published"));
  if (hsk) clauses.push(eq(grammarPatterns.hskLevel, Number(hsk)));
  if (category) clauses.push(eq(grammarPatterns.category, category));
  if (q) {
    clauses.push(
      or(
        ilike(grammarPatterns.title, `%${q}%`),
        ilike(grammarPatterns.pattern, `%${q}%`),
        ilike(grammarPatterns.pinyin, `%${q}%`),
        ilike(grammarPatterns.explanation, `%${q}%`)
      )
    );
  }

  const whereClause = clauses.length ? and(...clauses) : undefined;

  const patterns = await db.query.grammarPatterns.findMany({
    where: whereClause,
    orderBy: [asc(grammarPatterns.hskLevel), desc(grammarPatterns.createdAt)],
  });

  return NextResponse.json({ patterns });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    hskLevel?: number;
    category?: string;
    title?: string;
    pattern?: string;
    pinyin?: string;
    explanation?: string;
    examples?: string[];
    translations?: string[];
    mistakes?: string[];
    cantoneseDiff?: string;
    relatedLessonIds?: string[];
    relatedPracticeSetIds?: string[];
    status?: "draft" | "published";
    aiGenerated?: boolean;
  };

  if (!body.title?.trim() || !body.pattern?.trim() || !body.explanation?.trim()) {
    return NextResponse.json(
      { error: "title, pattern, and explanation are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(grammarPatterns)
    .values({
      hskLevel: body.hskLevel ?? 1,
      category: body.category?.trim() || "general",
      title: body.title.trim(),
      pattern: body.pattern.trim(),
      pinyin: body.pinyin?.trim() || null,
      explanation: body.explanation,
      examples: body.examples ?? [],
      translations: body.translations ?? [],
      mistakes: body.mistakes ?? [],
      cantoneseDiff: body.cantoneseDiff?.trim() || null,
      relatedLessonIds: body.relatedLessonIds ?? [],
      relatedPracticeSetIds: body.relatedPracticeSetIds ?? [],
      status: body.status ?? "draft",
      aiGenerated: body.aiGenerated ?? false,
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json({ pattern: created }, { status: 201 });
}
