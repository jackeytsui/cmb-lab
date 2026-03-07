import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoThreads, videoThreadSteps, videoThreadSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, asc, and, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

/**
 * Student-facing GET endpoint for thread data.
 * Any authenticated user can access (no coach/admin role required).
 * Returns thread metadata + steps with upload info (for Mux playback).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  try {
    const thread = await db.query.videoThreads.findFirst({
      where: eq(videoThreads.id, threadId),
      with: {
        steps: {
          orderBy: [asc(videoThreadSteps.sortOrder)],
          with: {
            upload: true,
          },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Flatten steps out of thread for easier client consumption
    const { steps, ...threadData } = thread;

    // Look up the most recent in_progress session for this user + thread
    const existingSessionRow = await db.query.videoThreadSessions.findFirst({
      where: and(
        eq(videoThreadSessions.threadId, threadId),
        eq(videoThreadSessions.studentId, user.id),
        eq(videoThreadSessions.status, "in_progress")
      ),
      orderBy: [desc(videoThreadSessions.startedAt)],
      columns: { id: true, lastStepId: true },
    });

    const existingSession = existingSessionRow
      ? { id: existingSessionRow.id, lastStepId: existingSessionRow.lastStepId }
      : null;

    return NextResponse.json({ thread: threadData, steps, existingSession });
  } catch (error) {
    console.error("Failed to fetch video thread:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
