import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  submissions,
  users,
  lessons,
  coachFeedback,
  coachNotes,
} from "@/db/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";

/**
 * GET /api/my-feedback
 * Returns the current user's submissions that have been reviewed by coaches.
 * Includes coach feedback (Loom videos, text) and shared notes (not internal).
 */
export async function GET() {
  // 1. Verify user is authenticated
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Get current user from database
    const currentUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Fetch reviewed submissions with coach feedback
    const reviewedSubmissions = await db
      .select({
        // Submission data
        submissionId: submissions.id,
        submissionType: submissions.type,
        score: submissions.score,
        reviewedAt: submissions.reviewedAt,
        // Lesson info
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        // Coach feedback
        feedbackId: coachFeedback.id,
        loomUrl: coachFeedback.loomUrl,
        feedbackText: coachFeedback.feedbackText,
        coachId: coachFeedback.coachId,
      })
      .from(submissions)
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(coachFeedback, eq(submissions.id, coachFeedback.submissionId))
      .where(
        and(
          eq(submissions.userId, currentUser.id),
          eq(submissions.status, "reviewed"),
          isNotNull(submissions.reviewedAt)
        )
      )
      .orderBy(desc(submissions.reviewedAt));

    // 4. Get coach names and shared notes for each submission
    const feedbackWithDetails = await Promise.all(
      reviewedSubmissions.map(async (sub) => {
        // Get coach name
        const coach = await db.query.users.findFirst({
          where: eq(users.id, sub.coachId),
          columns: { name: true, email: true },
        });

        // Get shared notes only (not internal)
        const sharedNotes = await db
          .select({
            content: coachNotes.content,
            createdAt: coachNotes.createdAt,
          })
          .from(coachNotes)
          .where(
            and(
              eq(coachNotes.submissionId, sub.submissionId),
              eq(coachNotes.visibility, "shared")
            )
          )
          .orderBy(desc(coachNotes.createdAt));

        return {
          submissionId: sub.submissionId,
          lessonId: sub.lessonId,
          lessonTitle: sub.lessonTitle,
          reviewedAt: sub.reviewedAt?.toISOString() || null,
          coachName: coach?.name || coach?.email?.split("@")[0] || "Coach",
          loomUrl: sub.loomUrl,
          feedbackText: sub.feedbackText,
          sharedNotes: sharedNotes.map((note) => ({
            content: note.content,
            createdAt: note.createdAt.toISOString(),
          })),
          submissionType: sub.submissionType,
          score: sub.score,
        };
      })
    );

    return NextResponse.json({ feedback: feedbackWithDetails });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
