import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download as DownloadIcon, Paperclip } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { QuizLessonViewer } from "./QuizLessonViewer";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function CourseLibraryLessonViewerPage({ params }: PageProps) {
  const { courseId, lessonId } = await params;

  const [row] = await db
    .select({
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      lessonType: courseLibraryLessons.lessonType,
      content: courseLibraryLessons.content,
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
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const content = (row.content ?? {}) as Record<string, unknown>;

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href={`/dashboard/course-library/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {row.courseTitle}
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
                <h2 className="text-sm font-semibold text-foreground mb-2">
                  About this lesson
                </h2>
                <div
                  className="prose prose-invert prose-sm max-w-none text-muted-foreground"
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
                className="prose prose-invert max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: (content.body as string) ?? "<p>(empty)</p>" }}
              />
            </div>
            <LessonAttachments attachments={content.attachments as Attachment[] | undefined} />
          </div>
        )}

        {row.lessonType === "download" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            {content.description ? (
              <div
                className="prose prose-invert prose-sm max-w-none text-muted-foreground"
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
