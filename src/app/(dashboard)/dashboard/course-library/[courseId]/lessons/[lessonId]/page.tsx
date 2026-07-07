import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download as DownloadIcon, Paperclip, Music, ExternalLink } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { FlashcardSaveButton } from "@/components/flashcards/FlashcardSaveButton";
import { QuizLessonViewer } from "./QuizLessonViewer";
import {
  TextAssignmentViewer,
  type TextAssignmentSubmissionDto,
} from "./TextAssignmentViewer";
import {
  ListeningPracticeViewer,
  type ListeningSentenceDto,
} from "./ListeningPracticeViewer";
import { CourseLibraryLessonControls } from "@/components/course-library/CourseLibraryLessonControls";
import { db } from "@/db";
import {
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";

interface Attachment {
  url: string;
  filename: string;
  sizeBytes: number;
}

function LessonAttachments({ attachments }: { attachments?: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Paperclip className="w-4 h-4" />
        Attachments
      </h3>
      {attachments.map((att) => (
        <a
          key={att.url}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-border bg-background p-2 hover:bg-muted/50 transition-colors"
        >
          <DownloadIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-foreground flex-1 truncate">{att.filename}</span>
          <span className="text-[10px] text-muted-foreground">
            {(att.sizeBytes / 1024 / 1024).toFixed(1)}MB
          </span>
        </a>
      ))}
    </div>
  );
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function CourseLibraryLessonViewerPage({ params }: PageProps) {
  const { courseId, lessonId } = await params;
  const currentUser = await getCurrentUser();

  const [row] = await db
    .select({
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      lessonType: courseLibraryLessons.lessonType,
      content: courseLibraryLessons.content,
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      courseTitle: courseLibraryCourses.title,
    })
    .from(courseLibraryLessons)
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
        eq(courseLibraryLessons.id, lessonId),
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(currentUser?.role),
        ),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const progress = currentUser
    ? await db.query.courseLibraryLessonProgress.findFirst({
        where: and(
          eq(courseLibraryLessonProgress.userId, currentUser.id),
          eq(courseLibraryLessonProgress.lessonId, lessonId),
        ),
      })
    : null;

  const content = (row.content ?? {}) as Record<string, unknown>;
  const lessonType = row.lessonType as string;

  // Listening Practice: build the student DTOs. Model-answer pinyin is only
  // included for sentences the student has already resolved (correct/gaveup),
  // so unanswered answers never reach the client.
  let listeningSentences: ListeningSentenceDto[] = [];
  if (row.lessonType === "listening_practice") {
    const rawSentences = Array.isArray(content.sentences)
      ? (content.sentences as Array<Record<string, unknown>>)
      : [];
    const answers =
      (progress?.quizAnswers as Record<
        string,
        { status: string; attempts: number }
      > | null) ?? {};
    listeningSentences = rawSentences
      .map((s, idx) => ({
        id: String(s.id ?? `sentence-${idx}`),
        order: typeof s.order === "number" ? s.order : idx,
        chinese: typeof s.chinese === "string" ? s.chinese : "",
        pinyin: typeof s.pinyin === "string" ? s.pinyin : "",
        hasOverride:
          typeof s.audioUrl === "string" && s.audioUrl.trim().length > 0,
      }))
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        const raw = answers[s.id]?.status;
        const status =
          raw === "correct"
            ? "correct"
            : raw === "gaveup"
              ? "gaveup"
              : raw === "incorrect"
                ? "incorrect"
                : "unanswered";
        const resolved = status === "correct" || status === "gaveup";
        return {
          id: s.id,
          chinese: s.chinese,
          hasOverride: s.hasOverride,
          initialStatus: status as ListeningSentenceDto["initialStatus"],
          revealedPinyin: resolved ? s.pinyin : null,
        };
      });
  }

  // Text assignment data is fetched ahead of the JSX below.
  let textAssignmentPrompts: Array<{
    id: string;
    label: string;
    description: string;
  }> = [];
  let textAssignmentSubmission: TextAssignmentSubmissionDto | null = null;
  if (row.lessonType === "text_assignment") {
    const rawPrompts = Array.isArray(content.sentencePrompts)
      ? (content.sentencePrompts as Array<Record<string, unknown>>)
      : [];
    textAssignmentPrompts = rawPrompts
      .map((p, idx) => ({
        id: String(p.id ?? `prompt-${idx}`),
        label: typeof p.label === "string" ? p.label : `Sentence ${idx + 1}`,
        description: typeof p.description === "string" ? p.description : "",
        order: typeof p.order === "number" ? p.order : idx,
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ id, label, description }) => ({ id, label, description }));

    if (currentUser) {
      const submission = await db.query.assignmentSubmissions.findFirst({
        where: and(
          eq(assignmentSubmissions.lessonId, lessonId),
          eq(assignmentSubmissions.studentId, currentUser.id),
        ),
      });
      if (submission) {
        const sentences =
          await db.query.assignmentSubmissionSentences.findMany({
            where: eq(
              assignmentSubmissionSentences.submissionId,
              submission.id,
            ),
            orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
          });
        textAssignmentSubmission = {
          id: submission.id,
          status: submission.status,
          submittedAt: submission.submittedAt?.toISOString() ?? null,
          finalScore: submission.finalScore,
          sentences: sentences.map((s) => ({
            promptId: s.promptId,
            chineseText: s.chineseText,
            generatedPinyin: s.generatedPinyin,
            generatedEnglish: s.generatedEnglish,
          })),
        };
      }
    }
  }

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href={`/dashboard/course-library/${courseId}/modules/${row.moduleId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {row.moduleTitle}
        </Link>

        <div className="mb-2 text-xs text-muted-foreground">
          {row.courseTitle} → {row.moduleTitle}
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {row.lessonTitle}
        </h1>

        {row.lessonType === "video" && (
          <div className="space-y-4">
            {content.videoUrl ? (
              <div className="rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  src={`/api/course-library/stream/${lessonId}#t=0.1`}
                  controls
                  playsInline
                  preload="metadata"
                  controlsList="nodownload"
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No video uploaded yet.
                </p>
              </div>
            )}
            {typeof content.description === "string" && content.description && (
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    About this lesson
                  </h2>
                  <FlashcardSaveButton
                    chinese={stripHtml(content.description as string)}
                    english={row.lessonTitle}
                    sourceLabel="Course lesson notes"
                    sourceType="course_lesson"
                    language="mixed"
                    compact
                    variant="bookmark"
                  />
                </div>
                <div
                  className="prose prose-invert prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                  dangerouslySetInnerHTML={{ __html: content.description as string }}
                />
              </div>
            )}
            {typeof content.transcript === "string" && content.transcript && (
              <details className="rounded-lg border border-border bg-card">
                <summary className="px-5 py-3 text-sm font-semibold text-foreground cursor-pointer">
                  Transcript
                </summary>
                <div className="px-5 pb-5">
                  <div className="mb-3 flex items-center justify-end">
                    <FlashcardSaveButton
                      chinese={content.transcript as string}
                      english={row.lessonTitle}
                      sourceLabel="Course lesson transcript"
                      sourceType="course_lesson"
                      language="mixed"
                      compact
                      variant="bookmark"
                    />
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                    {content.transcript as string}
                  </pre>
                </div>
              </details>
            )}
            <CourseLibraryLessonControls
              lessonId={lessonId}
              initialCompleted={!!progress?.completedAt}
            />
            <LessonAttachments attachments={content.attachments as Attachment[] | undefined} />
          </div>
        )}

        {row.lessonType === "text" && (
          <div className="space-y-4">
            {typeof content.thumbnailUrl === "string" && content.thumbnailUrl && (
              <div className="rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/course-library/image/${lessonId}`}
                  alt={row.lessonTitle}
                  className="w-full max-h-80 object-cover rounded-lg"
                />
              </div>
            )}
            <div className="rounded-lg border border-border bg-card p-6">
              <div
                className="prose prose-invert max-w-none text-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                dangerouslySetInnerHTML={{ __html: (content.body as string) ?? "<p>(empty)</p>" }}
              />
            </div>
            <CourseLibraryLessonControls
              lessonId={lessonId}
              initialCompleted={!!progress?.completedAt}
            />
            <LessonAttachments attachments={content.attachments as Attachment[] | undefined} />
          </div>
        )}

        {row.lessonType === "download" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            {content.description ? (
              <div
                className="prose prose-invert prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                dangerouslySetInnerHTML={{ __html: content.description as string }}
              />
            ) : null}
            {content.fileUrl ? (
              <a
                href={`/api/course-library/download/${lessonId}`}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <DownloadIcon className="w-4 h-4" />
                Download{" "}
                {typeof content.fileName === "string" ? content.fileName : "file"}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No file uploaded yet.
              </p>
            )}
            <CourseLibraryLessonControls
              lessonId={lessonId}
              initialCompleted={!!progress?.completedAt}
            />
          </div>
        )}

        {row.lessonType === "audio" && (
          <div className="space-y-4">
            {content.audioUrl ? (
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Music className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium text-foreground">Audio</span>
                </div>
                <audio
                  src={`/api/course-library/audio/${lessonId}`}
                  controls
                  preload="metadata"
                  controlsList="nodownload"
                  className="w-full"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">No audio uploaded yet.</p>
              </div>
            )}
            {typeof content.description === "string" && content.description && (
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">About this lesson</h2>
              <div
                className="prose prose-invert prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                dangerouslySetInnerHTML={{ __html: content.description as string }}
              />
              </div>
            )}
            {typeof content.transcript === "string" && content.transcript && (
              <details className="rounded-lg border border-border bg-card">
                <summary className="px-5 py-3 text-sm font-semibold text-foreground cursor-pointer">
                  Transcript
                </summary>
                <div className="px-5 pb-5">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                    {content.transcript as string}
                  </pre>
                </div>
              </details>
            )}
            <CourseLibraryLessonControls
              lessonId={lessonId}
              initialCompleted={!!progress?.completedAt}
            />
            <LessonAttachments attachments={content.attachments as Attachment[] | undefined} />
          </div>
        )}

        {lessonType === "form" && (
          <div className="space-y-4">
            {typeof content.description === "string" && content.description && (
              <div className="rounded-lg border border-border bg-card p-5">
              <div
                className="prose prose-invert prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                dangerouslySetInnerHTML={{ __html: content.description as string }}
              />
              </div>
            )}
            {typeof content.embedUrl === "string" && content.embedUrl ? (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
                  <ExternalLink className="w-3.5 h-3.5 text-pink-500" />
                  <span className="text-xs text-muted-foreground">Embedded content</span>
                </div>
                <iframe
                  src={content.embedUrl as string}
                  style={{ height: `${typeof content.embedHeight === "number" ? content.embedHeight : 600}px` }}
                  className="w-full"
                  title={row.lessonTitle}
                  loading="lazy"
                  allow="camera; microphone; geolocation"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">Form not available yet.</p>
              </div>
            )}
            <CourseLibraryLessonControls
              lessonId={lessonId}
              initialCompleted={!!progress?.completedAt}
            />
          </div>
        )}

        {row.lessonType === "text_assignment" && (
          <div className="space-y-5">
            {typeof content.description === "string" &&
              content.description && (
                <div
                  className="prose prose-invert max-w-none text-foreground prose-p:text-foreground prose-li:text-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                  dangerouslySetInnerHTML={{
                    __html: content.description as string,
                  }}
                />
              )}
            {textAssignmentPrompts.length > 0 ? (
              <TextAssignmentViewer
                lessonId={lessonId}
                prompts={textAssignmentPrompts}
                initialSubmission={textAssignmentSubmission}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  This assignment has no sentence prompts yet.
                </p>
              </div>
            )}
          </div>
        )}

        {row.lessonType === "listening_practice" && (
          <div className="space-y-5">
            {typeof content.description === "string" &&
              content.description && (
                <div
                  className="prose prose-invert max-w-none text-foreground prose-p:text-foreground prose-li:text-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
                  dangerouslySetInnerHTML={{
                    __html: content.description as string,
                  }}
                />
              )}
            {listeningSentences.length > 0 ? (
              <ListeningPracticeViewer
                lessonId={lessonId}
                sentences={listeningSentences}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  This listening practice has no sentences yet.
                </p>
              </div>
            )}
          </div>
        )}

        {row.lessonType === "quiz" && (() => {
          // Strip correctOptionIds before passing to client so answers
          // can't be read from the DOM.
          const rawQuestions = Array.isArray(content.questions)
            ? (content.questions as Array<Record<string, unknown>>)
            : [];
          const safeQuestions = rawQuestions.map((q) => ({
            id: String(q.id ?? ""),
            prompt: String(q.prompt ?? ""),
            type: (q.type as "single" | "multiple" | "true_false") ?? "single",
            options: Array.isArray(q.options)
              ? (q.options as Array<{ id: string; text: string }>).map((o) => ({
                  id: String(o.id ?? ""),
                  text: String(o.text ?? ""),
                }))
              : [],
            points: typeof q.points === "number" ? q.points : 1,
          }));
          const safeQuiz = {
            description: typeof content.description === "string" ? content.description : undefined,
            passingScore: typeof content.passingScore === "number" ? content.passingScore : 70,
            questions: safeQuestions,
          };
          return <QuizLessonViewer lessonId={lessonId} quiz={safeQuiz} />;
        })()}
      </div>
    </FeatureGate>
  );
}
