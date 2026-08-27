import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { submissions, coachFeedback } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/ghl/webhooks";
import { sendCoachFeedbackNotification } from "@/lib/coach-feedback-notification";
import { z } from "zod";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

const feedbackSchema = z.object({
  loomUrl: z.string().trim().max(2_000).optional(),
  feedbackText: z.string().trim().max(20_000).optional(),
}).strict().refine(
  (value) => Boolean(value.loomUrl || value.feedbackText),
  "At least one feedback field is required",
);

/**
 * Validate Loom URL format
 */
function isValidLoomUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "loom.com" ||
      parsed.hostname === "www.loom.com" ||
      parsed.hostname === "share.loom.com"
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/submissions/[submissionId]/feedback
 * Save coach feedback for a submission (Loom URL and/or text)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }
  const currentUser = access.realActor;

  const { submissionId } = await params;
  if (!z.string().uuid().safeParse(submissionId).success) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  try {
    const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "At least one of loomUrl or feedbackText is required" },
        { status: 400 }
      );
    }
    const { loomUrl, feedbackText } = parsed.data;

    // 3. Validate Loom URL format if provided
    if (loomUrl && !isValidLoomUrl(loomUrl)) {
      return NextResponse.json(
        { error: "Invalid Loom URL. Must be from loom.com or share.loom.com" },
        { status: 400 }
      );
    }

    // 4. Verify submission exists
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        user: {
          columns: {
            email: true,
            name: true,
            assignedCoachId: true,
          },
        },
        lesson: { columns: { title: true } },
      },
    });

    if (
      !submission ||
      !canStaffAccessStudent({
        actorUserId: access.actor.id,
        actorRole: access.actor.role,
        assignedCoachId: submission.user.assignedCoachId,
      })
    ) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // 5. Upsert coach feedback (one feedback per submission)
    const existingFeedback = await db.query.coachFeedback.findFirst({
      where: eq(coachFeedback.submissionId, submissionId),
    });

    let feedback;
    if (existingFeedback) {
      // Update existing feedback
      const [updated] = await db
        .update(coachFeedback)
        .set({
          loomUrl: loomUrl || null,
          feedbackText: feedbackText || null,
          coachId: currentUser.id,
        })
        .where(eq(coachFeedback.id, existingFeedback.id))
        .returning();
      feedback = updated;
    } else {
      // Create new feedback
      const [created] = await db
        .insert(coachFeedback)
        .values({
          submissionId,
          coachId: currentUser.id,
          loomUrl: loomUrl || null,
          feedbackText: feedbackText || null,
        })
        .returning();
      feedback = created;
    }

    // 6. Update submission status to reviewed
    await db
      .update(submissions)
      .set({
        status: "reviewed",
        reviewedAt: new Date(),
        reviewedBy: currentUser.id,
      })
      .where(eq(submissions.id, submissionId));

    // 7. Trigger email notification (fire and forget)
    try {
      await sendCoachFeedbackNotification({
        studentEmail: submission.user.email,
        studentName: submission.user.name || "Student",
        lessonTitle: submission.lesson.title,
        coachName: currentUser.name || "Your Coach",
        loomUrl: loomUrl || undefined,
        feedbackText: feedbackText || undefined,
      });
    } catch (notifyError) {
      // Log but don't fail the request
      console.error("Failed to send notification:", notifyError);
    }

    // 8. Create in-app notification (fire and forget)
    try {
      const coachName = currentUser.name || "Your Coach";
      await createNotification({
        userId: submission.userId,
        type: "coach_feedback",
        category: "feedback",
        title: "New feedback from your coach",
        body: `${coachName} left feedback on your submission for ${submission.lesson.title}`,
        linkUrl: "/my-feedback",
      });
    } catch (notifyError) {
      // Log but don't fail the request
      console.error("Failed to create in-app notification:", notifyError);
    }

    // 9. Dispatch GHL webhook for coach feedback (fire and forget)
    try {
      dispatchWebhook({
        userId: submission.userId,
        userEmail: submission.user.email,
        eventType: "feedback.sent",
        entityType: "submission",
        entityId: submissionId,
        context: {
          submissionId,
          lessonId: submission.lessonId,
          lessonTitle: submission.lesson.title,
          coachName: currentUser.name || "Coach",
          hasLoomUrl: !!loomUrl,
          hasFeedbackText: !!feedbackText,
        },
      }).catch((err) => {
        console.error("[GHL] Feedback webhook dispatch failed:", err);
      });
    } catch (webhookError) {
      console.error("[GHL] Feedback webhook setup failed:", webhookError);
    }

    return NextResponse.json(feedback, { status: existingFeedback ? 200 : 201 });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/submissions/[submissionId]/feedback
 * Get existing coach feedback for a submission
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }

  const { submissionId } = await params;
  if (!z.string().uuid().safeParse(submissionId).success) {
    return NextResponse.json({ error: "No feedback found for this submission" }, { status: 404 });
  }

  try {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: { id: true },
      with: { user: { columns: { assignedCoachId: true } } },
    });
    if (
      !submission ||
      !canStaffAccessStudent({
        actorUserId: access.actor.id,
        actorRole: access.actor.role,
        assignedCoachId: submission.user.assignedCoachId,
      })
    ) {
      return NextResponse.json(
        { error: "No feedback found for this submission" },
        { status: 404 },
      );
    }

    // 2. Get feedback with coach info
    const feedback = await db.query.coachFeedback.findFirst({
      where: eq(coachFeedback.submissionId, submissionId),
      with: {
        coach: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!feedback) {
      return NextResponse.json(
        { error: "No feedback found for this submission" },
        { status: 404 }
      );
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error("Get feedback error:", error);
    return NextResponse.json(
      { error: "Failed to get feedback" },
      { status: 500 }
    );
  }
}
