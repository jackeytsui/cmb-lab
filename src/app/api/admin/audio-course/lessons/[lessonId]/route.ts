import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

function parseLessonAudioUrl(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { audioUrl?: string };
    return typeof parsed.audioUrl === "string" ? parsed.audioUrl : "";
  } catch {
    return "";
  }
}

function parseLessonTranscript(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { transcript?: string };
    return typeof parsed.transcript === "string" ? parsed.transcript : "";
  } catch {
    return "";
  }
}

function stringifyLessonContent(audioUrl: string, transcript?: string) {
  const content: Record<string, string> = { audioUrl: audioUrl.trim() };
  if (transcript !== undefined) {
    if (transcript.trim()) content.transcript = transcript.trim();
  }
  return JSON.stringify(content);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  const [existing] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

  if (!existing) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    audioUrl?: string;
    transcript?: string;
    durationMinutes?: number | null;
  };

  const nextAudioUrl =
    typeof body.audioUrl === "string"
      ? body.audioUrl.trim()
      : parseLessonAudioUrl(existing.content);
  if (!nextAudioUrl) {
    return NextResponse.json({ error: "Lesson audio URL is required" }, { status: 400 });
  }

  const nextTranscript =
    body.transcript !== undefined
      ? body.transcript
      : parseLessonTranscript(existing.content);

  const [updated] = await db
    .update(lessons)
    .set({
      title: body.title?.trim() || existing.title,
      description: body.description?.trim() ?? null,
      content: stringifyLessonContent(nextAudioUrl, nextTranscript),
      durationSeconds:
        typeof body.durationMinutes === "number" && body.durationMinutes > 0
          ? Math.round(body.durationMinutes * 60)
          : null,
    })
    .where(eq(lessons.id, lessonId))
    .returning();

  return NextResponse.json({ lesson: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  await db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, lessonId));
  return NextResponse.json({ success: true });
}
