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

function stringifyLessonContent(audioUrl: string) {
  return JSON.stringify({ audioUrl: audioUrl.trim() });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
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

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    audioUrl?: string;
    durationMinutes?: number | null;
  };
  const title = body.title?.trim() ?? "";
  const audioUrl = body.audioUrl?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ error: "Lesson title is required" }, { status: 400 });
  }
  if (!audioUrl) {
    return NextResponse.json({ error: "Lesson audio URL is required" }, { status: 400 });
  }

  const seriesModule = await ensureSeriesModule(seriesId);
  const lessonRows = await db
    .select({ sortOrder: lessons.sortOrder })
    .from(lessons)
    .where(and(eq(lessons.moduleId, seriesModule.id), isNull(lessons.deletedAt)))
    .orderBy(asc(lessons.sortOrder));
  const nextOrder = (lessonRows[lessonRows.length - 1]?.sortOrder ?? -1) + 1;

  const [created] = await db
    .insert(lessons)
    .values({
      moduleId: seriesModule.id,
      title,
      description: body.description?.trim() ?? null,
      content: stringifyLessonContent(audioUrl),
      durationSeconds:
        typeof body.durationMinutes === "number" && body.durationMinutes > 0
          ? Math.round(body.durationMinutes * 60)
          : null,
      sortOrder: nextOrder,
    })
    .returning();

  return NextResponse.json({ lesson: created }, { status: 201 });
}
