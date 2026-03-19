import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingNoteStars } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .insert(coachingNoteStars)
    .values({ noteId, userId: dbUser.id })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(coachingNoteStars)
    .where(and(eq(coachingNoteStars.noteId, noteId), eq(coachingNoteStars.userId, dbUser.id)));

  return NextResponse.json({ ok: true });
}
