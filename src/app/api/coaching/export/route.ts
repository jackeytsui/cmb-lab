import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingSessions, coachingNotes, users } from "@/db/schema";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true, email: true },
  });
  return dbUser ?? null;
}

export async function GET(request: Request) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const studentEmailParam = url.searchParams.get("studentEmail");
  const sessionIdParam = url.searchParams.get("sessionId");

  if (typeParam !== "one_on_one" && typeParam !== "inner_circle") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  // If a specific sessionId is provided, export only that session's notes
  if (sessionIdParam) {
    const session = await db.query.coachingSessions.findFirst({
      where: eq(coachingSessions.id, sessionIdParam),
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const notes = await db
      .select()
      .from(coachingNotes)
      .where(eq(coachingNotes.sessionId, sessionIdParam))
      .orderBy(coachingNotes.order);

    return NextResponse.json({
      sessions: [{ ...session, notes }],
    });
  }

  // Otherwise export all sessions for the given type/student
  let whereClause;
  if (typeParam === "one_on_one") {
    const normalizedStudentEmail = studentEmailParam?.trim() || "";
    if (normalizedStudentEmail) {
      whereClause = and(
        eq(coachingSessions.type, "one_on_one"),
        ilike(coachingSessions.studentEmail, normalizedStudentEmail),
      );
    } else {
      whereClause = eq(coachingSessions.type, "one_on_one");
    }
  } else {
    whereClause = eq(coachingSessions.type, "inner_circle");
  }

  const sessions = await db
    .select()
    .from(coachingSessions)
    .where(whereClause)
    .orderBy(desc(coachingSessions.updatedAt));

  if (sessions.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionIds = sessions.map((s) => s.id);
  const notes = await db
    .select()
    .from(coachingNotes)
    .where(inArray(coachingNotes.sessionId, sessionIds))
    .orderBy(coachingNotes.order);

  const notesBySession = new Map<string, typeof notes>();
  for (const note of notes) {
    const list = notesBySession.get(note.sessionId) ?? [];
    list.push(note);
    notesBySession.set(note.sessionId, list);
  }

  const responseSessions = sessions.map((session) => ({
    ...session,
    notes: notesBySession.get(session.id) ?? [],
  }));

  return NextResponse.json({ sessions: responseSessions });
}
