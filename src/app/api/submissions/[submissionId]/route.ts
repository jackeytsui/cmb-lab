import { NextRequest, NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
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
import { z } from "zod";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

/**
 * GET /api/submissions/[submissionId]
 * Get single submission with full details for coach review.
 * Requires coach or admin role.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const currentUser = await getRealUser();
  if (!currentUser || currentUser.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (currentUser.role !== "coach" && currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { submissionId } = await params;
    if (!z.string().uuid().safeParse(submissionId).success) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // 4. Fetch submission with all related data
    const submissionData = await db
      .select({
        // Submission data
        id: submissions.id,
        type: submissions.type,
        response: submissions.response,
        audioData: submissions.audioData,
        videoUrl: submissions.videoUrl,
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
        videoUrl: submission.videoUrl,
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
