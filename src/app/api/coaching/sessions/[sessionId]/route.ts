import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingSessions, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { checkRole, hasMinimumRole } from "@/lib/auth";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { title } = body as { title?: string };

  const [updated] = await db
    .update(coachingSessions)
    .set({ title: title?.trim() || "Session" })
    .where(eq(coachingSessions.id, sessionId))
    .returning();

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = await checkRole("admin");
  if (isAdmin) {
    const deleted = await db
      .delete(coachingSessions)
      .where(eq(coachingSessions.id, sessionId))
      .returning({ id: coachingSessions.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // Coach can only delete sessions they created.
  const deleted = await db
    .delete(coachingSessions)
    .where(and(eq(coachingSessions.id, sessionId), eq(coachingSessions.createdBy, dbUser.id)))
    .returning({ id: coachingSessions.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Session not found or not owned by you" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
