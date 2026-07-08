import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryLessons,
} from "@/db/schema";
import { getAssignmentReviewer } from "@/lib/assignment-review";
import { sanitizeRecordingUrl } from "@/lib/recording-embed";
import { createNotification } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

const correctionEntrySchema = z.object({
  chinese: z.string().max(2000),
  pinyin: z.string().max(4000).default(""),
  english: z.string().max(4000).default(""),
});

const sentenceReviewSchema = z.object({
  sentenceId: z.string().uuid(),
  // Zero or more alternative correct phrasings. Empty array = "well read".
  corrections: z.array(correctionEntrySchema).max(20).default([]),
});

const reviewSchema = z.object({
  sentences: z.array(sentenceReviewSchema).min(1).max(50),
  extraComment: z.string().max(20000).optional(),
  recordingUrl: z.string().max(2000).optional(),
});

/** Treat editor output that contains no text/images as empty. */
function normalizeExtraComment(html: string | undefined): string | null {
  if (!html) return null;
  const stripped = html
    .replace(/<img[^>]*>/gi, "[img]")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return stripped ? html : null;
}

/**
 * POST /api/admin/assignment-submissions/[submissionId]/vocal-review
 * Submit (or update) a Vocal Hack review: an optional corrected sentence per
 * recording (with generated-then-editable pinyin/English), an extra comment,
 * and a recording link. No score — pronunciation review is qualitative.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const reviewer = await getAssignmentReviewer("vocal_hack");
  if (!reviewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const submission = await db.query.assignmentSubmissions.findFirst({
    where: eq(assignmentSubmissions.id, submissionId),
  });
  if (!submission || submission.assignmentType !== "vocal_hack") {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.status === "draft") {
    return NextResponse.json(
      { error: "This submission has not been submitted yet." },
      { status: 409 },
    );
  }

  const sentences = await db.query.assignmentSubmissionSentences.findMany({
    where: eq(assignmentSubmissionSentences.submissionId, submissionId),
    orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
  });
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));

  const reviewedIds = new Set(parsed.data.sentences.map((s) => s.sentenceId));
  if (
    reviewedIds.size !== parsed.data.sentences.length ||
    sentences.length !== parsed.data.sentences.length ||
    ![...reviewedIds].every((id) => sentenceById.has(id))
  ) {
    return NextResponse.json(
      { error: "Review must cover each sentence of this submission exactly once." },
      { status: 400 },
    );
  }

  let recordingUrl: string | null = null;
  if (parsed.data.recordingUrl?.trim()) {
    recordingUrl = sanitizeRecordingUrl(parsed.data.recordingUrl);
    if (!recordingUrl) {
      return NextResponse.json(
        { error: "Recording link is not a valid URL." },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const wasReviewed = submission.status === "reviewed";

  for (const review of parsed.data.sentences) {
    // Keep only entries with actual Chinese text.
    const alternatives = review.corrections
      .map((c) => ({
        chinese: c.chinese.trim(),
        pinyin: c.pinyin.trim(),
        english: c.english.trim(),
      }))
      .filter((c) => c.chinese.length > 0);
    const hasCorrection = alternatives.length > 0;
    const first = alternatives[0];
    await db
      .update(assignmentSubmissionSentences)
      .set({
        correctedAlternatives: hasCorrection ? alternatives : null,
        // Legacy single columns mirror the first alternative.
        correctedChinese: first ? first.chinese : null,
        correctedPinyin: first ? first.pinyin : null,
        correctedEnglish: first ? first.english : null,
        reviewVerdict: hasCorrection ? "needs_correction" : "correct",
      })
      .where(eq(assignmentSubmissionSentences.id, review.sentenceId));
  }

  const [updated] = await db
    .update(assignmentSubmissions)
    .set({
      status: "reviewed",
      reviewerId: reviewer.id,
      reviewedAt: now,
      recordingUrl,
      extraComment: normalizeExtraComment(parsed.data.extraComment),
      // New/updated feedback is unread again.
      studentViewedAt: null,
    })
    .where(eq(assignmentSubmissions.id, submissionId))
    .returning();

  // In-app notification — only on the first review, not on review edits.
  if (!wasReviewed) {
    const lesson = await db.query.courseLibraryLessons.findFirst({
      where: eq(courseLibraryLessons.id, submission.lessonId),
      columns: { title: true },
    });
    const lessonTitle = lesson?.title ?? "Your Vocal Hack";
    try {
      await createNotification({
        userId: submission.studentId,
        type: "submission_graded",
        category: "feedback",
        title: `"${lessonTitle}" has been reviewed`,
        body: `Your Vocal Hack recordings for "${lessonTitle}" have been reviewed. Tap to see your coach's feedback.`,
        linkUrl: `/dashboard/assignment-feedback/${submissionId}`,
        metadata: { submissionId, lessonId: submission.lessonId },
      });
    } catch (err) {
      console.error("Failed to create vocal hack review notification:", err);
    }
  }

  return NextResponse.json({ submission: updated });
}
