import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentCorrections,
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { lessonLanguage } from "@/lib/lesson-language";
import { CorrectedSentence } from "@/components/assignments/CorrectedSentence";
import { ModelAnnotatedSentence } from "@/components/assignments/ModelAnnotatedSentence";
import { AssignmentReviewRecording } from "@/components/student/AssignmentReviewRecording";
import { applyCorrectionChanges } from "@/lib/assignment-corrections";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ submissionId: string }>;
}

export default async function AssignmentFeedbackDetailPage({
  params,
}: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { submissionId } = await params;

  // Students can only ever load their own reviewed submissions.
  const [row] = await db
    .select({
      submission: assignmentSubmissions,
      lessonTitle: courseLibraryLessons.title,
      lessonType: courseLibraryLessons.lessonType,
      lessonContent: courseLibraryLessons.content,
      moduleTitle: courseLibraryModules.title,
      courseTitle: courseLibraryCourses.title,
    })
    .from(assignmentSubmissions)
    .innerJoin(
      courseLibraryLessons,
      eq(assignmentSubmissions.lessonId, courseLibraryLessons.id),
    )
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(assignmentSubmissions.id, submissionId),
        eq(assignmentSubmissions.studentId, user.id),
        eq(assignmentSubmissions.status, "reviewed"),
      ),
    )
    .limit(1);

  if (!row) notFound();

  // Opening the feedback marks it as read (clears the sidebar badge).
  if (!row.submission.studentViewedAt) {
    await db
      .update(assignmentSubmissions)
      .set({ studentViewedAt: new Date() })
      .where(
        and(
          eq(assignmentSubmissions.id, submissionId),
          isNull(assignmentSubmissions.studentViewedAt),
        ),
      );
  }

  const sentences = await db.query.assignmentSubmissionSentences.findMany({
    where: eq(assignmentSubmissionSentences.submissionId, submissionId),
    orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
  });
  const corrections = sentences.length
    ? await db.query.assignmentCorrections.findMany({
        where: inArray(
          assignmentCorrections.sentenceId,
          sentences.map((s) => s.id),
        ),
        orderBy: [asc(assignmentCorrections.startOffset)],
      })
    : [];

  const lessonContent = (row.lessonContent ?? {}) as Record<string, unknown>;
  const description =
    typeof lessonContent.description === "string"
      ? lessonContent.description
      : "";
  const lang = lessonLanguage(row.lessonType);
  const correctionDtosBySentence = new Map(
    sentences.map((sentence) => [
      sentence.id,
      corrections
        .filter((correction) => correction.sentenceId === sentence.id)
        .map((correction) => ({
          id: correction.id,
          operation: correction.operation,
          startOffset: correction.startOffset,
          endOffset: correction.endOffset,
          originalText: correction.originalText,
          suggestedChinese: correction.suggestedChinese,
          suggestedPinyin: correction.suggestedPinyin,
          suggestedEnglish: correction.suggestedEnglish,
        })),
    ]),
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div>
        <Link
          href="/assignment-feedback"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Assignment Feedback
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {row.lessonTitle}
              </h1>
              <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Reviewed
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {row.courseTitle} → {row.moduleTitle}
              {row.submission.reviewedAt && (
                <>
                  {" · Reviewed on "}
                  {new Date(row.submission.reviewedAt).toLocaleString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </>
              )}
            </p>
          </div>
          {row.submission.assignmentType !== "vocal_hack" && (
            <div className="rounded-lg border border-border bg-card px-5 py-3 text-center">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Score
              </div>
              <div className="text-2xl font-bold text-foreground">
                {typeof row.submission.finalScore === "number"
                  ? `${row.submission.finalScore}%`
                  : "—"}
              </div>
            </div>
          )}
        </div>
      </div>

      {description && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Assignment Description
          </h2>
          <div
            className="prose prose-invert prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        </div>
      )}

      {row.submission.recordingUrl && (
        <AssignmentReviewRecording url={row.submission.recordingUrl} />
      )}

      {row.submission.assignmentType === "diary" &&
        row.submission.studentAudioUrl && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Your recording
            </h2>
            <audio
              controls
              preload="none"
              controlsList="nodownload"
              src={`/api/course-library/submission-recording/${row.submission.id}`}
              className="w-full"
            />
          </div>
        )}

      <div className="space-y-4">
        {sentences.map((sentence, idx) =>
          row.submission.assignmentType === "vocal_hack" ? (
            <div
              key={sentence.id}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <p className="text-sm font-semibold text-foreground">
                {idx + 1}. {sentence.promptLabel || `Sentence ${idx + 1}`}
              </p>
              <ModelAnnotatedSentence
                chinese={sentence.chineseText}
                pinyin={sentence.generatedPinyin}
                english={sentence.generatedEnglish}
                lang={lang}
              />
              {sentence.audioUrl && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Your recording
                  </p>
                  {sentence.responseMediaType === "video" ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      controlsList="nodownload"
                      src={`/api/course-library/assignment-recordings/${sentence.id}`}
                      className="max-h-80 w-full rounded-md bg-black"
                    />
                  ) : (
                    <audio
                      controls
                      preload="none"
                      controlsList="nodownload"
                      src={`/api/course-library/assignment-recordings/${sentence.id}`}
                      className="w-full"
                    />
                  )}
                </div>
              )}
              {(() => {
                const alternatives =
                  sentence.correctedAlternatives ??
                  (sentence.correctedChinese
                    ? [
                        {
                          chinese: sentence.correctedChinese,
                          pinyin: sentence.correctedPinyin ?? "",
                          english: sentence.correctedEnglish ?? "",
                        },
                      ]
                    : []);
                if (alternatives.length === 0) {
                  return (
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      ✓ Well read — no correction needed.
                    </p>
                  );
                }
                return (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {alternatives.length > 1
                        ? "Coach's corrections (any of these work)"
                        : "Coach's correction"}
                    </p>
                    {alternatives.map((alt, i) => (
                      <ModelAnnotatedSentence
                        key={i}
                        chinese={alt.chinese}
                        pinyin={alt.pinyin}
                        english={alt.english}
                        lang={lang}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div
              key={sentence.id}
              className="rounded-lg border border-border bg-card p-5 space-y-2"
            >
              <p className="text-sm font-semibold text-foreground">
                {idx + 1}. {sentence.promptLabel || `Sentence ${idx + 1}`}
              </p>
              {sentence.promptDescription && (
                <p className="text-sm text-muted-foreground">
                  {sentence.promptDescription}
                </p>
              )}
              <CorrectedSentence
                text={sentence.chineseText}
                lang={lang}
                pinyin={sentence.generatedPinyin}
                corrections={correctionDtosBySentence.get(sentence.id) ?? []}
              />
              <p className="text-lg text-muted-foreground italic">
                {sentence.generatedEnglish}
              </p>
              {(correctionDtosBySentence.get(sentence.id)?.length ?? 0) > 0 && (
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Suggested sentence
                  </span>
                  <p className="mt-0.5 text-lg text-foreground">
                    {applyCorrectionChanges(
                      sentence.chineseText,
                      correctionDtosBySentence.get(sentence.id) ?? [],
                    )}
                  </p>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {row.submission.extraComment && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Teacher&apos;s Comment
          </h2>
          <div
            className="prose prose-invert prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{ __html: row.submission.extraComment }}
          />
        </div>
      )}
    </div>
  );
}
