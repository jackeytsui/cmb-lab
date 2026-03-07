import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  submissions,
  users,
  lessons,
  interactions,
  coachFeedback,
  coachNotes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

/**
 * GET /api/submissions/[submissionId]
 * Get single submission with full details for coach review.
 * Requires coach or admin role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has coach role or higher
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { submissionId } = await params;

    // 3. Get current user for notes filtering
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 4. Fetch submission with all related data
    const submissionData = await db
      .select({
        // Submission data
        id: submissions.id,
        type: submissions.type,
        response: submissions.response,
        audioData: submissions.audioData,
        score: submissions.score,
        aiFeedback: submissions.aiFeedback,
        transcription: submissions.transcription,
        status: submissions.status,
        reviewedAt: submissions.reviewedAt,
        createdAt: submissions.createdAt,
        updatedAt: submissions.updatedAt,
        // Student info
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        // Lesson info
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        lessonModuleId: lessons.moduleId,
        // Interaction info
        interactionId: interactions.id,
        interactionPrompt: interactions.prompt,
        interactionExpectedAnswer: interactions.expectedAnswer,
        interactionType: interactions.type,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(interactions, eq(submissions.interactionId, interactions.id))
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (submissionData.length === 0) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    const submission = submissionData[0];

    // 5. Fetch coach feedback if exists
    const feedbackData = await db
      .select()
      .from(coachFeedback)
      .where(eq(coachFeedback.submissionId, submissionId))
      .limit(1);

    // 6. Fetch coach notes for this submission
    // Coaches see internal notes, everyone sees shared notes
    const notesData = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.submissionId, submissionId),
          // Filter: coach sees all their notes, others see only shared
          eq(coachNotes.coachId, currentUser.id)
        )
      );

    return NextResponse.json({
      submission: {
        id: submission.id,
        type: submission.type,
        response: submission.response,
        audioData: submission.audioData,
        score: submission.score,
        aiFeedback: submission.aiFeedback,
        transcription: submission.transcription,
        status: submission.status,
        reviewedAt: submission.reviewedAt,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
      },
      student: {
        id: submission.studentId,
        name: submission.studentName,
        email: submission.studentEmail,
      },
      lesson: {
        id: submission.lessonId,
        title: submission.lessonTitle,
        moduleId: submission.lessonModuleId,
      },
      interaction: {
        id: submission.interactionId,
        prompt: submission.interactionPrompt,
        expectedAnswer: submission.interactionExpectedAnswer,
        type: submission.interactionType,
      },
      feedback: feedbackData[0] || null,
      notes: notesData,
    });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return NextResponse.json(
      { error: "Failed to fetch submission" },
      { status: 500 }
    );
  }
}
