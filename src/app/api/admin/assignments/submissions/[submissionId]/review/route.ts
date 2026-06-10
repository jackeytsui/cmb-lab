import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { lessonSubmissions, lessonReviews, users, lessons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { AssignmentReviewData } from "@/lib/assignment-types";

const bodySchema = z.object({
  comments: z.array(z.string()).default([]),
  loomUrl: z.string().url().optional().or(z.literal("")),
  overallFeedback: z.string().optional(),
  notifyStudent: z.boolean().default(true),
});

/**
 * POST /api/admin/assignments/submissions/[submissionId]/review
 * Coach submits review for a student submission. Marks submission as reviewed,
 * upserts the review record, and optionally emails the student.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const coach = await getCurrentUser();
  if (!coach) {
    return NextResponse.json({ error: "Coach not found" }, { status: 401 });
  }

  const { submissionId } = await params;

  const submission = await db.query.lessonSubmissions.findFirst({
    where: eq(lessonSubmissions.id, submissionId),
    with: {
      lesson: { columns: { title: true, lessonType: true } },
      user: { columns: { id: true, email: true, name: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { comments, loomUrl, overallFeedback, notifyStudent } = parsed.data;

  const reviewData: AssignmentReviewData = {
    comments,
    loomUrl: loomUrl || undefined,
    overallFeedback: overallFeedback || undefined,
  };

  // Upsert review
  const [review] = await db
    .insert(lessonReviews)
    .values({
      submissionId,
      reviewedBy: coach.id,
      reviewData: JSON.stringify(reviewData),
      notifiedAt: null,
    })
    .onConflictDoUpdate({
      target: [lessonReviews.submissionId],
      set: {
        reviewedBy: coach.id,
        reviewData: JSON.stringify(reviewData),
        notifiedAt: null,
      },
    })
    .returning();

  // Mark submission as reviewed
  await db
    .update(lessonSubmissions)
    .set({ status: "reviewed", updatedAt: new Date() })
    .where(eq(lessonSubmissions.id, submissionId));

  // Send email notification to student
  if (notifyStudent && submission.user.email) {
    try {
      await sendReviewNotification({
        studentEmail: submission.user.email,
        studentName: submission.user.name || submission.user.email,
        lessonTitle: (submission.lesson as { title: string }).title,
        loomUrl: loomUrl || null,
        overallFeedback: overallFeedback || null,
      });
      await db
        .update(lessonReviews)
        .set({ notifiedAt: new Date() })
        .where(eq(lessonReviews.id, review.id));
    } catch (err) {
      console.error("Failed to send review notification:", err);
    }
  }

  return NextResponse.json({ ok: true, reviewId: review.id });
}

async function sendReviewNotification(params: {
  studentEmail: string;
  studentName: string;
  lessonTitle: string;
  loomUrl: string | null;
  overallFeedback: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping review notification");
    return;
  }

  const from =
    process.env.INVITATION_EMAIL_FROM?.trim() || "CMB Lab <cmb-lab@thecmblueprint.com>";

  const loomSection = params.loomUrl
    ? `<p><strong>Coach video feedback:</strong> <a href="${params.loomUrl}">${params.loomUrl}</a></p>`
    : "";
  const feedbackSection = params.overallFeedback
    ? `<p><strong>Overall feedback:</strong></p><p>${params.overallFeedback.replace(/\n/g, "<br>")}</p>`
    : "";

  const html = `
    <p>Hi ${params.studentName},</p>
    <p>Your coach has reviewed your submission for <strong>${params.lessonTitle}</strong>.</p>
    ${feedbackSection}
    ${loomSection}
    <p>Log in to CMB Lab to see the full feedback.</p>
    <p>— The CMB Team</p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.studentEmail,
      subject: `Your coach reviewed "${params.lessonTitle}"`,
      html,
    }),
  });
}
