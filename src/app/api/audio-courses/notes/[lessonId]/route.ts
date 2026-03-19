import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { audioLessonNotes, users } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/audio-courses/notes/[lessonId]
 * Returns the current user's note for this lesson.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ content: "" });
  }

  const { lessonId } = await params;
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
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { lessonId } = await params;
  const body = (await request.json()) as { content?: string };
  const content = typeof body.content === "string" ? body.content : "";

  await db
    .insert(audioLessonNotes)
    .values({ userId: dbUser.id, lessonId, content })
    .onConflictDoUpdate({
      target: [audioLessonNotes.userId, audioLessonNotes.lessonId],
      set: { content, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
