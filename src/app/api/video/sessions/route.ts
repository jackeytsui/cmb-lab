import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions, videoCaptions } from "@/db/schema";
import { eq, and, desc, gt } from "drizzle-orm";

/**
 * GET /api/video/sessions
 *
 * Returns the user's recent video sessions (with captions, max 5).
 */
export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const sessions = await db
      .select({
        id: videoSessions.id,
        youtubeVideoId: videoSessions.youtubeVideoId,
        youtubeUrl: videoSessions.youtubeUrl,
        title: videoSessions.title,
        captionCount: videoSessions.captionCount,
        completionPercent: videoSessions.completionPercent,
        updatedAt: videoSessions.updatedAt,
      })
      .from(videoSessions)
      .where(
        and(
          eq(videoSessions.userId, user.id),
          gt(videoSessions.captionCount, 0)
        )
      )
      .orderBy(desc(videoSessions.updatedAt))
      .limit(5);

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("List sessions error:", error);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/video/sessions?id=xxx
 *
 * Deletes a video session and its captions.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get("id");
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session id" },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Verify session belongs to user before deleting
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

    // Captions cascade-delete via FK, but delete explicitly for clarity
    await db
      .delete(videoCaptions)
      .where(eq(videoCaptions.videoSessionId, sessionId));
    await db
      .delete(videoSessions)
      .where(eq(videoSessions.id, sessionId));

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
