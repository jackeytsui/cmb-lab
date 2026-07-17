import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

export const dynamic = "force-dynamic";

/**
 * POST /api/progress/[lessonId]/position
 *
 * Saves the student's last playback position for a lesson video so the player
 * can resume where they left off ("記住你睇到邊" / Netflix-style resume).
 *
 * This is intentionally separate from POST /api/progress/[lessonId]: it is
 * called frequently during playback and on tab close (via navigator.sendBeacon),
 * so it must stay cheap and side-effect-free — no completion check, no XP, no
 * milestone dispatch.
 *
 * Accepts both application/json (fetch) and text/plain (sendBeacon fallback).
 *
 * Body: { lastPositionSeconds: number }
 * Returns: { ok: true }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonId } = await params;

    // Parse body — sendBeacon may send text/plain rather than application/json.
    let body: { lastPositionSeconds?: unknown };
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const rawText = await request.text();
      body = JSON.parse(rawText);
    }

    const { lastPositionSeconds } = body;
    if (
      typeof lastPositionSeconds !== "number" ||
      !Number.isFinite(lastPositionSeconds) ||
      lastPositionSeconds < 0
    ) {
      return NextResponse.json(
        { error: "lastPositionSeconds must be a non-negative number" },
        { status: 400 }
      );
    }

    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { saveLessonPosition } = await import("@/lib/progress");

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await saveLessonPosition({
      userId: user.id,
      lessonId,
      lastPositionSeconds,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving lesson position:", error);
    return NextResponse.json(
      { error: "Failed to save position" },
      { status: 500 }
    );
  }
}
