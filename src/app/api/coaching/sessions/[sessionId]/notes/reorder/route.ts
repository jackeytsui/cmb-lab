import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingNotes, coachingSessions, users } from "@/db/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, email: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");

  const body = await request.json();
  const { noteIds, pane } = body as { noteIds?: string[]; pane?: "mandarin" | "cantonese" };
  if (!noteIds || noteIds.length === 0) {
    return NextResponse.json({ error: "noteIds required" }, { status: 400 });
  }
  if (pane !== "mandarin" && pane !== "cantonese") {
    return NextResponse.json({ error: "Invalid pane" }, { status: 400 });
  }

  const session = await db.query.coachingSessions.findFirst({
    where: eq(coachingSessions.id, sessionId),
    columns: { id: true, type: true, studentEmail: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!isCoachOrAdmin) {
    const studentEmail = (dbUser.email ?? "").trim();
    const ownsSession =
      session.type === "one_on_one" &&
      Boolean(studentEmail) &&
      Boolean(session.studentEmail) &&
      (await db
        .select({ id: coachingSessions.id })
        .from(coachingSessions)
        .where(
          and(
            eq(coachingSessions.id, sessionId),
            eq(coachingSessions.type, "one_on_one"),
            ilike(coachingSessions.studentEmail, studentEmail),
          ),
        )
        .limit(1)).length > 0;

    if (!ownsSession) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const notes = await db
    .select({ id: coachingNotes.id })
    .from(coachingNotes)
    .where(
      and(
        eq(coachingNotes.sessionId, sessionId),
        eq(coachingNotes.pane, pane),
        inArray(coachingNotes.id, noteIds),
      ),
    );
  if (notes.length !== noteIds.length) {
    return NextResponse.json({ error: "Invalid noteIds for session/pane" }, { status: 400 });
  }

  // Assign descending order so earlier in list appears first
  const updates = noteIds.map((id, idx) =>
    db
      .update(coachingNotes)
      .set({ order: noteIds.length - idx })
      .where(eq(coachingNotes.id, id)),
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
