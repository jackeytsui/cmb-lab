import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { audioLessonNotes } from "@/db/schema";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAudioLesson } from "@/lib/audio-course-lesson-access";

const noteSchema = z
  .object({ content: z.string().max(20_000) })
  .strict();

/**
 * GET /api/audio-courses/notes/[lessonId]
 * Returns the current user's note for this lesson.
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
  const note = await db.query.audioLessonNotes.findFirst({
    where: and(
      eq(audioLessonNotes.userId, dbUser.id),
      eq(audioLessonNotes.lessonId, lessonId),
    ),
    columns: { content: true },
  });

  return NextResponse.json({ content: note?.content ?? "" });
}

/**
 * PUT /api/audio-courses/notes/[lessonId]
 * Upserts the current user's note for this lesson.
 */
export async function PUT(
  request: NextRequest,
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
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  }
  const { content } = parsed.data;

  await db
    .insert(audioLessonNotes)
    .values({ userId: dbUser.id, lessonId, content })
    .onConflictDoUpdate({
      target: [audioLessonNotes.userId, audioLessonNotes.lessonId],
      set: { content, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
