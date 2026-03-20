import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

function parseSeries(raw: string | null) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { audioCourse?: boolean };
    return parsed.audioCourse === true;
  } catch {
    return false;
  }
}

function stringifyLessonContent(audioUrl: string, transcript?: string) {
  const content: Record<string, string> = { audioUrl: audioUrl.trim() };
  if (transcript?.trim()) content.transcript = transcript.trim();
  return JSON.stringify(content);
}

async function ensureSeriesModule(seriesId: string) {
  const moduleRows = await db
    .select()
    .from(modules)
    .where(and(eq(modules.courseId, seriesId), isNull(modules.deletedAt)))
    .orderBy(asc(modules.sortOrder), asc(modules.createdAt));

  if (moduleRows[0]) return moduleRows[0];

  const [created] = await db
    .insert(modules)
    .values({
      courseId: seriesId,
      title: "Series Content",
      description: "Audio lesson list",
      sortOrder: 0,
    })
    .returning();
  return created;
}

type LessonInput = {
  title?: string;
  description?: string;
  audioUrl?: string;
  transcript?: string;
  durationMinutes?: number | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { seriesId } = await params;
  const [series] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, seriesId), isNull(courses.deletedAt)));
  if (!series || !parseSeries(series.description)) {
    return NextResponse.json({ error: "Audio series not found" }, { status: 404 });
  }

  const raw = await request.json();

  // Support bulk: { lessons: [...] } or single: { title, audioUrl, ... }
  const inputs: LessonInput[] = Array.isArray(raw.lessons) ? raw.lessons : [raw];

  const seriesModule = await ensureSeriesModule(seriesId);
  const existingLessons = await db
    .select({ sortOrder: lessons.sortOrder })
    .from(lessons)
    .where(and(eq(lessons.moduleId, seriesModule.id), isNull(lessons.deletedAt)))
    .orderBy(asc(lessons.sortOrder));
  let nextOrder = (existingLessons[existingLessons.length - 1]?.sortOrder ?? -1) + 1;

  const created = [];
  for (const input of inputs) {
    const title = input.title?.trim() ?? "";
    const audioUrl = input.audioUrl?.trim() ?? "";
    if (!title || !audioUrl) continue;

    const [lesson] = await db
      .insert(lessons)
      .values({
        moduleId: seriesModule.id,
        title,
        description: input.description?.trim() ?? null,
        content: stringifyLessonContent(audioUrl, input.transcript),
        durationSeconds:
          typeof input.durationMinutes === "number" && input.durationMinutes > 0
            ? Math.round(input.durationMinutes * 60)
            : null,
        sortOrder: nextOrder++,
      })
      .returning();
    created.push(lesson);
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: "No valid lessons provided. Each lesson needs a title and audio URL." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { lessons: created, count: created.length },
    { status: 201 },
  );
}
