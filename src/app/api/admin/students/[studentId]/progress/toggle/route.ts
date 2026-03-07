import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessonProgress } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const body = await request.json();
  const { lessonId, isComplete } = body;

  if (!lessonId || typeof isComplete !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if (isComplete) {
      // Mark as complete. If record doesn't exist, create it.
      await db
        .insert(lessonProgress)
        .values({
          userId: studentId,
          lessonId,
          completedAt: new Date(),
          videoWatchedPercent: 0, // Don't assume video watched, just unlock
          interactionsCompleted: 0,
          lastAccessedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [lessonProgress.userId, lessonProgress.lessonId],
          set: { completedAt: new Date() },
        });
    } else {
      // Mark incomplete
      await db
        .update(lessonProgress)
        .set({ completedAt: null })
        .where(
          and(
            eq(lessonProgress.userId, studentId),
            eq(lessonProgress.lessonId, lessonId)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to toggle progress:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 }
    );
  }
}
