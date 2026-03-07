import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * POST /api/video/progress
 *
 * Saves video watch progress for a session.
 * Handles both application/json (normal fetch) and text/plain (sendBeacon fallback).
 * Uses SQL GREATEST() to ensure completionPercent is monotonically increasing.
 *
 * Body: { sessionId: string, lastPositionMs: number, videoDurationMs: number, title?: string }
 * Returns: { ok: true }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is authenticated
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body -- handle both application/json and text/plain (sendBeacon)
    let body: {
      sessionId: string;
      lastPositionMs: number;
      videoDurationMs: number;
      title?: string;
    };

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // sendBeacon may send as text/plain or other content types
      const rawText = await request.text();
      body = JSON.parse(rawText);
    }

    const { sessionId, lastPositionMs, videoDurationMs, title } = body;

    if (!sessionId || typeof lastPositionMs !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, lastPositionMs" },
        { status: 400 }
      );
    }

    // 3. Get internal user from DB
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // 4. Verify session belongs to user
    const session = await db.query.videoSessions.findFirst({
      where: and(
        eq(videoSessions.id, sessionId),
        eq(videoSessions.userId, user.id)
      ),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // 5. Compute completion percentage (monotonic via GREATEST in SQL)
    const newPercent =
      videoDurationMs > 0
        ? Math.min(
            100,
            Math.round((lastPositionMs / videoDurationMs) * 100)
          )
        : 0;

    // 6. Build update object
    const updateData: Record<string, unknown> = {
      lastPositionMs,
      videoDurationMs: videoDurationMs ?? session.videoDurationMs,
      completionPercent: sql`GREATEST(${videoSessions.completionPercent}, ${newPercent})`,
      updatedAt: new Date(),
    };

    // Only set title if provided AND session title is null (first title capture)
    if (title && !session.title) {
      updateData.title = title;
    }

    // 7. Update session
    await db
      .update(videoSessions)
      .set(updateData)
      .where(eq(videoSessions.id, sessionId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Progress save error:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
