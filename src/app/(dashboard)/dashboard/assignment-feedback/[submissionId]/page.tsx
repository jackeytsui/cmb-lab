import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Video } from "lucide-react";
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
import { parseRecordingEmbed } from "@/lib/recording-embed";
import { CorrectedSentence } from "@/components/assignments/CorrectedSentence";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ submissionId: string }>;
}

function RecordingEmbed({ url }: { url: string }) {
  const embed = parseRecordingEmbed(url);
  if (!embed) return null;

  if (embed.kind === "link") {
    return (
      <a
        href={embed.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-md border border-border bg-background p-3 hover:bg-muted/50 transition-colors"
      >
        <Video className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground flex-1 truncate">
          Watch your review recording
        </span>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
      </a>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
      <iframe
        src={embed.embedUrl}
        title="Review recording"
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div>
        <Link
          href="/dashboard/assignment-feedback"
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

      <div className="space-y-4">
        {sentences.map((sentence, idx) => (
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
              corrections={corrections
                .filter((c) => c.sentenceId === sentence.id)
                .map((c) => ({
                  id: c.id,
                  startOffset: c.startOffset,
                  endOffset: c.endOffset,
                  suggestedChinese: c.suggestedChinese,
                  suggestedPinyin: c.suggestedPinyin,
                  suggestedEnglish: c.suggestedEnglish,
                }))}
            />
            <p className="text-lg text-muted-foreground italic">
              {sentence.generatedEnglish}
            </p>
          </div>
        ))}
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

      {row.submission.recordingUrl && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Review Recording
          </h2>
          <RecordingEmbed url={row.submission.recordingUrl} />
        </div>
      )}
    </div>
  );
}
