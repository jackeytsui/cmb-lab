import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  videoThreadResponses,
  videoThreadSessionReviews,
  videoThreadSessions,
} from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string; sessionId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { threadId, sessionId } = await params;

  try {
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
