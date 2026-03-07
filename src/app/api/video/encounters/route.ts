import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions, videoVocabEncounters } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/video/encounters
 *
 * Batch-inserts vocabulary encounters for a video session.
 * Handles both application/json (normal fetch) and text/plain (sendBeacon fallback).
 * Deduplicates at the DB level via onConflictDoNothing on the
 * unique constraint (video_vocab_encounters_session_word).
 *
 * Body: { sessionId: string, words: string[] }
 * Returns: { ok: true, count: number }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is authenticated
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body -- handle both application/json and text/plain (sendBeacon)
    let body: { sessionId: string; words: string[] };

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // sendBeacon may send as text/plain or other content types
      const rawText = await request.text();
      body = JSON.parse(rawText);
    }

    const { sessionId, words } = body;

    // 3. Validate inputs
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: sessionId" },
        { status: 400 }
      );
    }

    if (!Array.isArray(words) || words.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: words (non-empty array)" },
        { status: 400 }
      );
    }

    // Validate each word: must be a string, max 50 chars
    for (const word of words) {
      if (typeof word !== "string" || word.length === 0 || word.length > 50) {
        return NextResponse.json(
          { error: "Each word must be a non-empty string of max 50 characters" },
          { status: 400 }
        );
      }
    }

    // 4. Get internal user from DB
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // 5. Verify session belongs to user
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

    // 6. Batch insert encounters with deduplication
    await db
      .insert(videoVocabEncounters)
      .values(
        words.map((w) => ({
          videoSessionId: sessionId,
          word: w,
          positionMs: null,
        }))
      )
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, count: words.length });
  } catch (error) {
    console.error("Encounters save error:", error);
    return NextResponse.json(
      { error: "Failed to save encounters" },
      { status: 500 }
    );
  }
}
