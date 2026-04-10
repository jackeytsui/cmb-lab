import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download as DownloadIcon } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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
                <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                  {content.description as string}
                </pre>
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
          </div>
        )}

        {row.lessonType === "text" && (
          <div className="rounded-lg border border-border bg-card p-6">
            <pre className="whitespace-pre-wrap font-sans text-base text-foreground leading-relaxed">
              {(content.body as string) ?? "(empty)"}
            </pre>
          </div>
        )}

        {row.lessonType === "download" && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            {content.description ? (
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                {content.description as string}
              </pre>
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

        {row.lessonType === "quiz" && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Quiz viewer coming soon.
            </p>
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
