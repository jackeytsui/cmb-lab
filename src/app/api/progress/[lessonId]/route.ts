import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

export const dynamic = "force-dynamic";

/**
 * GET /api/progress/[lessonId]
 *
 * Fetch progress for a specific lesson.
 * Returns both the raw progress record and computed completion status.
 * Requires authentication via Clerk.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonId } = await params;

    // Dynamic imports
    const { db } = await import("@/db");
    const { users, lessonProgress } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { checkLessonCompletion } = await import("@/lib/progress");

    // Get internal user ID by querying users table where clerkId matches
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: {
        id: true,
        languagePreference: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Query lesson_progress for (userId, lessonId)
    const progress = await db.query.lessonProgress.findFirst({
      where: and(
        eq(lessonProgress.userId, user.id),
        eq(lessonProgress.lessonId, lessonId)
      ),
    });

    // Check completion status with language preference filtering
    const completion = await checkLessonCompletion(
      user.id,
      lessonId,
      user.languagePreference
    );

    return NextResponse.json({
      progress: progress ?? null,
      completion,
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to fetch progress: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/progress/[lessonId]
 *
 * Update progress for a specific lesson.
 * Accepts videoWatchedPercent and/or interactionCompleted.
 * Automatically marks lesson complete when criteria met.
 * Requires authentication via Clerk.
 *
 * Body: { videoWatchedPercent?: number, interactionCompleted?: boolean, forceComplete?: boolean }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonId } = await params;

    // Dynamic imports
    const { db } = await import("@/db");
    const { users, lessonProgress } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { upsertLessonProgress, checkLessonCompletion } = await import("@/lib/progress");
    const { detectAndDispatchMilestones } = await import("@/lib/ghl/milestones");
    const { awardXP } = await import("@/lib/xp-service");

    // Get internal user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: {
        id: true,
        languagePreference: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { videoWatchedPercent, interactionCompleted, forceComplete } = body;

    // Validate videoWatchedPercent is 0-100 if provided
    if (
      videoWatchedPercent !== undefined &&
      (typeof videoWatchedPercent !== "number" ||
        videoWatchedPercent < 0 ||
        videoWatchedPercent > 100)
    ) {
      return NextResponse.json(
        { error: "videoWatchedPercent must be a number between 0 and 100" },
        { status: 400 }
      );
    }

    // Upsert progress record
    const progress = await upsertLessonProgress({
      userId: user.id,
      lessonId,
      videoWatchedPercent: forceComplete ? 100 : videoWatchedPercent,
      interactionCompleted,
    });

    // Check completion status with language preference filtering
    const completion = await checkLessonCompletion(
      user.id,
      lessonId,
      user.languagePreference
    );

    // If completion criteria met OR forced, and lesson not already marked complete
    let lessonComplete = false;
    if (
      (forceComplete || completion.isComplete) &&
      progress.completedAt === null
    ) {
      await db
        .update(lessonProgress)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(lessonProgress.userId, user.id),
            eq(lessonProgress.lessonId, lessonId)
          )
        );
      lessonComplete = true;
    }

    // Fire-and-forget: dispatch GHL webhooks for milestone detection
    if (lessonComplete) {
      detectAndDispatchMilestones(user.id, lessonId).catch((err) => {
        console.error("[GHL] Milestone detection failed:", err);
      });

      // Fire-and-forget: award XP for lesson completion
      awardXP({
        userId: user.id,
        source: "lesson_complete",
        amount: 50,
        entityId: lessonId,
        entityType: "lesson",
      }).catch((err) => console.error("[XP] Lesson XP award failed:", err));
    }

    return NextResponse.json({
      progress,
      completion,
      lessonComplete,
    });
  } catch (error) {
    console.error("Error updating progress:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to update progress: ${errorMessage}` },
      { status: 500 }
    );
  }
}