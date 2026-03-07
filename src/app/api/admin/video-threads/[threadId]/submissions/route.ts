import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  videoThreads,
  videoThreadResponses,
  videoThreadSessionReviews,
  videoThreadSessions,
} from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { threadId } = await params;

  try {
    const thread = await db.query.videoThreads.findFirst({
      where: eq(videoThreads.id, threadId),
      columns: { id: true, title: true },
    });
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const sessions = await db
      .select({
        id: videoThreadSessions.id,
        studentId: videoThreadSessions.studentId,
        studentName: users.name,
        studentEmail: users.email,
        status: videoThreadSessions.status,
        startedAt: videoThreadSessions.startedAt,
        completedAt: videoThreadSessions.completedAt,
      })
      .from(videoThreadSessions)
      .innerJoin(users, eq(videoThreadSessions.studentId, users.id))
      .where(eq(videoThreadSessions.threadId, threadId))
      .orderBy(desc(videoThreadSessions.startedAt));

    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      return NextResponse.json({
        thread: { id: thread.id, title: thread.title },
        sessions: [],
      });
    }

    const responseCounts = await db
      .select({
        sessionId: videoThreadResponses.sessionId,
        count: sql<number>`count(*)::int`,
      })
      .from(videoThreadResponses)
      .where(inArray(videoThreadResponses.sessionId, sessionIds))
      .groupBy(videoThreadResponses.sessionId);

    const latestReviews = await db
      .select({
        sessionId: videoThreadSessionReviews.sessionId,
        message: videoThreadSessionReviews.message,
        loomUrl: videoThreadSessionReviews.loomUrl,
        createdAt: videoThreadSessionReviews.createdAt,
      })
      .from(videoThreadSessionReviews)
      .where(inArray(videoThreadSessionReviews.sessionId, sessionIds))
      .orderBy(
        asc(videoThreadSessionReviews.sessionId),
        desc(videoThreadSessionReviews.createdAt)
      );

    const countMap = new Map(responseCounts.map((r) => [r.sessionId, r.count]));
    const latestReviewMap = new Map<
      string,
      { message: string | null; loomUrl: string | null; createdAt: Date }
    >();
    for (const review of latestReviews) {
      if (!latestReviewMap.has(review.sessionId)) {
        latestReviewMap.set(review.sessionId, {
          message: review.message,
          loomUrl: review.loomUrl,
          createdAt: review.createdAt,
        });
      }
    }

    return NextResponse.json({
      thread: { id: thread.id, title: thread.title },
      sessions: sessions.map((session) => ({
        ...session,
        responseCount: countMap.get(session.id) ?? 0,
        latestReview: latestReviewMap.get(session.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch thread submissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread submissions" },
      { status: 500 }
    );
  }
}
