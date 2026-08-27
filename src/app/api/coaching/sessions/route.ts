import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingSessions, coachingNotes, coachingNoteStars } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole, getRealUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/platform-roles";
import { getCoachingStudentAccess } from "@/lib/coaching-student-access";

function getNextSessionTitle(existingTitles: string[]) {
  let maxSessionNumber = 0;
  for (const title of existingTitles) {
    const match = /^Session\s+(\d+)$/i.exec((title || "").trim());
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) {
      maxSessionNumber = Math.max(maxSessionNumber, value);
    }
  }
  return `Session ${maxSessionNumber + 1}`;
}

export async function GET(request: Request) {
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const studentEmailParam = url.searchParams.get("studentEmail");

  if (typeParam !== "one_on_one" && typeParam !== "inner_circle") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  // Use the effective user's role (respects View As impersonation)
  const isCoachOrAdmin = isStaffRole(dbUser.role);
  const isStudent = !isCoachOrAdmin;
  let studentEmail = (dbUser.email ?? "").trim();
  const normalizedStudentEmailParam = studentEmailParam?.trim() || "";

  let whereClause;
  if (typeParam === "one_on_one") {
    if (isStudent) {
      whereClause = and(
        eq(coachingSessions.type, "one_on_one"),
        ilike(coachingSessions.studentEmail, studentEmail),
      );
    } else if (normalizedStudentEmailParam) {
      const access = await getCoachingStudentAccess(
        normalizedStudentEmailParam,
      );
      if (!access.ok) {
        return NextResponse.json(
          { error: access.error },
          { status: access.status },
        );
      }
      studentEmail = access.student.email;
      whereClause = and(
        eq(coachingSessions.type, "one_on_one"),
        ilike(coachingSessions.studentEmail, studentEmail),
      );
    } else if (dbUser.role !== "admin") {
      return NextResponse.json({ sessions: [] });
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
    .orderBy(desc(coachingSessions.createdAt));

  if (sessions.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionIds = sessions.map((s) => s.id);
  const notes = await db
    .select()
    .from(coachingNotes)
    .where(inArray(coachingNotes.sessionId, sessionIds))
    .orderBy(desc(coachingNotes.order), desc(coachingNotes.createdAt));

  const noteIds = notes.map((n) => n.id);
  let starredSet = new Set<string>();
  if (noteIds.length > 0) {
    // Filter stars through the notes' sessions in SQL instead of expanding
    // every note ID into an IN list. Inner Circle has tens of thousands of
    // historical notes, which can exceed the database driver's bind limit.
    const stars = await db
      .select({ noteId: coachingNoteStars.noteId })
      .from(coachingNoteStars)
      .innerJoin(coachingNotes, eq(coachingNoteStars.noteId, coachingNotes.id))
      .innerJoin(
        coachingSessions,
        eq(coachingNotes.sessionId, coachingSessions.id),
      )
      .where(
        and(
          eq(coachingNoteStars.userId, dbUser.id),
          whereClause,
        ),
      );
    starredSet = new Set(stars.map((s) => s.noteId));
  }

  const notesBySession = new Map<
    string,
    Array<(typeof notes)[number] & { starred: 0 | 1 }>
  >();
  for (const note of notes) {
    const list = notesBySession.get(note.sessionId) ?? [];
    list.push({ ...note, starred: starredSet.has(note.id) ? 1 : 0 });
    notesBySession.set(note.sessionId, list);
  }

  const responseSessions = sessions.map((session) => ({
    ...session,
    notes: notesBySession.get(session.id) ?? [],
  }));

  return NextResponse.json({ sessions: responseSessions });
}

export async function POST(request: Request) {
  const realHasAccess = await hasMinimumRole("coach");
  if (!realHasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, title, studentEmail } = body as {
    type: "one_on_one" | "inner_circle";
    title?: string;
    studentEmail?: string | null;
  };

  if (type !== "one_on_one" && type !== "inner_circle") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (type === "one_on_one" && (!studentEmail || !studentEmail.trim())) {
    return NextResponse.json(
      { error: "studentEmail required for one_on_one" },
      { status: 400 },
    );
  }
  let normalizedStudentEmail =
    type === "one_on_one" ? studentEmail!.trim().toLowerCase() : null;

  if (type === "one_on_one") {
    const access = await getCoachingStudentAccess(normalizedStudentEmail);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }
    normalizedStudentEmail = access.student.email.toLowerCase();
  }

  const now = new Date();
  let defaultTitle =
    type === "inner_circle"
      ? `ICGC_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
          now.getDate(),
        ).padStart(2, "0")}`
      : "Session 1";

  if (type === "one_on_one" && normalizedStudentEmail) {
    const existingSessions = await db
      .select({ title: coachingSessions.title })
      .from(coachingSessions)
      .where(
        and(
          eq(coachingSessions.type, "one_on_one"),
          ilike(coachingSessions.studentEmail, normalizedStudentEmail),
        ),
      );
    defaultTitle = getNextSessionTitle(existingSessions.map((row) => row.title));
  }

  const [created] = await db
    .insert(coachingSessions)
    .values({
      type,
      title: title?.trim() || defaultTitle,
      studentEmail: normalizedStudentEmail,
      createdBy: dbUser.id,
    })
    .returning();

  return NextResponse.json({ session: created });
}
