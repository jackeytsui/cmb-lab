import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  videoThreadSessionReviews,
  videoThreadSessions,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

interface RouteParams {
  params: Promise<{ threadId: string; sessionId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId, sessionId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(threadId).success || !uuid.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const [session] = await db
      .select({
        id: videoThreadSessions.id,
        assignedCoachId: users.assignedCoachId,
      })
      .from(videoThreadSessions)
      .innerJoin(users, eq(videoThreadSessions.studentId, users.id))
      .where(
        and(
          eq(videoThreadSessions.id, sessionId),
          eq(videoThreadSessions.threadId, threadId),
        ),
      )
      .limit(1);
    if (
      !session ||
      !canStaffAccessStudent({
        actorUserId: access.actor.id,
        actorRole: access.actor.role,
        assignedCoachId: session.assignedCoachId,
      })
    ) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await req.json();
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const loomUrl =
      typeof body.loomUrl === "string" ? body.loomUrl.trim() : "";

    if (!message && !loomUrl) {
      return NextResponse.json(
        { error: "Message or Loom URL is required" },
        { status: 400 }
      );
    }

    const [review] = await db
      .insert(videoThreadSessionReviews)
      .values({
        sessionId,
        coachId: access.realActor.id,
        message: message || null,
        loomUrl: loomUrl || null,
      })
      .returning();

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Failed to save thread submission response:", error);
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    );
  }
}
