import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingNoteStars, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const dbUser = await getCurrentDbUser();
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
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(coachingNoteStars)
    .where(and(eq(coachingNoteStars.noteId, noteId), eq(coachingNoteStars.userId, dbUser.id)));

  return NextResponse.json({ ok: true });
}
