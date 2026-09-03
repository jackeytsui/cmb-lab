import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  videoThreadResponses,
  videoThreadSessionReviews,
  videoThreadSessions,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

interface RouteParams {
  params: Promise<{ threadId: string; sessionId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
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
    const [sessionAccess] = await db
      .select({
        id: videoThreadSessions.id,
        threadId: videoThreadSessions.threadId,
        assignedCoachId: users.assignedCoachId,
        additionalCoachIds: users.additionalCoachIds,
      })
      .from(videoThreadSessions)
      .innerJoin(users, eq(videoThreadSessions.studentId, users.id))
      .where(eq(videoThreadSessions.id, sessionId))
      .limit(1);

    if (
      !sessionAccess ||
      sessionAccess.threadId !== threadId ||
      !canStaffAccessStudent({
        actorUserId: access.actor.id,
        actorRole: access.actor.role,
        assignedCoachId: sessionAccess.assignedCoachId,
        additionalCoachIds: sessionAccess.additionalCoachIds,
      })
    ) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = await db.query.videoThreadSessions.findFirst({
      where: eq(videoThreadSessions.id, sessionId),
      with: {
        student: {
          columns: { id: true, name: true, email: true },
        },
        thread: {
          columns: { id: true, title: true },
        },
        responses: {
          orderBy: [asc(videoThreadResponses.createdAt)],
          with: {
            step: {
              columns: { id: true, promptText: true, sortOrder: true },
            },
          },
        },
      },
    });

    if (!session || session.threadId !== threadId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const reviews = await db.query.videoThreadSessionReviews.findMany({
      where: eq(videoThreadSessionReviews.sessionId, sessionId),
      orderBy: [asc(videoThreadSessionReviews.createdAt)],
      with: {
        coach: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ session, reviews });
  } catch (error) {
    console.error("Failed to fetch thread submission detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch submission detail" },
      { status: 500 }
    );
  }
}
