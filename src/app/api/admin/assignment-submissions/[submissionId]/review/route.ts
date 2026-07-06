import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assignmentCorrections,
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryLessons,
} from "@/db/schema";
import { getAssignmentReviewer } from "@/lib/assignment-review";
import {
  calculateTextAssignmentScore,
  hasOverlappingRanges,
  isValidCorrectionRange,
} from "@/lib/assignment-scoring";
import { sanitizeRecordingUrl } from "@/lib/recording-embed";
import { createNotification } from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

const correctionSchema = z.object({
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(1),
  originalText: z.string().min(1).max(2000),
  suggestedChinese: z.string().min(1).max(2000),
  suggestedPinyin: z.string().max(4000).default(""),
  suggestedEnglish: z.string().max(4000).default(""),
});

const sentenceReviewSchema = z.object({
  sentenceId: z.string().uuid(),
  verdict: z.enum(["correct", "needs_correction"]),
  corrections: z.array(correctionSchema).max(50).default([]),
});

const reviewSchema = z.object({
  sentences: z.array(sentenceReviewSchema).min(1).max(50),
  overrideScore: z.number().int().min(0).max(100).nullable().optional(),
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
 * POST /api/admin/assignment-submissions/[submissionId]/review
 * Submit (or update) a review: per-sentence verdicts, offset-based
 * corrections, auto/final score, extra comment, recording link.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const reviewer = await getAssignmentReviewer();
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
  if (!submission) {
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

  // Every sentence must be reviewed, and reviews must target this submission.
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

  // Validate correction ranges against the exact submitted text.
  for (const review of parsed.data.sentences) {
    const sentence = sentenceById.get(review.sentenceId)!;
    const corrections =
      review.verdict === "correct" ? [] : review.corrections;

    if (review.verdict === "needs_correction" && corrections.length === 0) {
      return NextResponse.json(
        {
          error: `"${sentence.chineseText}" is marked as needing correction but has no corrections.`,
        },
        { status: 400 },
      );
    }
    if (hasOverlappingRanges(corrections)) {
      return NextResponse.json(
        { error: "Corrections in one sentence must not overlap." },
        { status: 400 },
      );
    }
    for (const correction of corrections) {
      if (
        !isValidCorrectionRange(correction, sentence.chineseText.length) ||
        sentence.chineseText.slice(
          correction.startOffset,
          correction.endOffset,
        ) !== correction.originalText
      ) {
        return NextResponse.json(
          { error: "A correction has an invalid character range." },
          { status: 400 },
        );
      }
    }
  }

  // Recording URL: accept any valid http(s) URL (Loom is only a warning
  // client-side, never a blocker).
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

  // Authoritative score calculation (Chinese characters only).
  const autoScore = calculateTextAssignmentScore(
    parsed.data.sentences.map((review) => ({
      chineseText: sentenceById.get(review.sentenceId)!.chineseText,
      corrections: review.verdict === "correct" ? [] : review.corrections,
    })),
  );
  const overrideScore = parsed.data.overrideScore ?? null;
  const scoreOverridden = overrideScore !== null;
  const finalScore = scoreOverridden ? overrideScore : autoScore;

  const now = new Date();
  const wasReviewed = submission.status === "reviewed";

  // Persist verdicts + corrections (replace-all keeps re-reviews consistent).
  const sentenceIds = sentences.map((s) => s.id);
  await db
    .delete(assignmentCorrections)
    .where(inArray(assignmentCorrections.sentenceId, sentenceIds));

  for (const review of parsed.data.sentences) {
    await db
      .update(assignmentSubmissionSentences)
      .set({ reviewVerdict: review.verdict })
      .where(eq(assignmentSubmissionSentences.id, review.sentenceId));
  }

  const correctionRows = parsed.data.sentences.flatMap((review) =>
    (review.verdict === "correct" ? [] : review.corrections).map(
      (correction) => ({
        sentenceId: review.sentenceId,
        startOffset: correction.startOffset,
        endOffset: correction.endOffset,
        originalText: correction.originalText,
        suggestedChinese: correction.suggestedChinese,
        suggestedPinyin: correction.suggestedPinyin,
        suggestedEnglish: correction.suggestedEnglish,
        createdByReviewerId: reviewer.id,
      }),
    ),
  );
  if (correctionRows.length > 0) {
    await db.insert(assignmentCorrections).values(correctionRows);
  }

  const [updated] = await db
    .update(assignmentSubmissions)
    .set({
      status: "reviewed",
      reviewerId: reviewer.id,
      reviewedAt: now,
      autoScore,
      finalScore,
      scoreOverridden,
      recordingUrl,
      extraComment: normalizeExtraComment(parsed.data.extraComment),
      // New/updated feedback is unread again.
      studentViewedAt: null,
    })
    .where(eq(assignmentSubmissions.id, submissionId))
    .returning();

  // In-app notification (existing notification system) — only on the first
  // review, not on review edits.
  if (!wasReviewed) {
    const lesson = await db.query.courseLibraryLessons.findFirst({
      where: eq(courseLibraryLessons.id, submission.lessonId),
      columns: { title: true },
    });
    try {
      await createNotification({
        userId: submission.studentId,
        type: "submission_graded",
        category: "feedback",
        title: "Your Text Assignment has been reviewed",
        body: `"${lesson?.title ?? "Text Assignment"}" has been reviewed${
          typeof finalScore === "number" ? ` — score ${finalScore}%` : ""
        }. Tap to see your feedback.`,
        linkUrl: `/dashboard/assignment-feedback/${submissionId}`,
        metadata: { submissionId, lessonId: submission.lessonId },
      });
    } catch (err) {
      console.error("Failed to create assignment review notification:", err);
    }
  }

  return NextResponse.json({ submission: updated });
}
