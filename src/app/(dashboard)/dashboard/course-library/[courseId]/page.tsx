import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Video,
  FileText,
  HelpCircle,
  Download,
  Music,
  ExternalLink,
  ClipboardList,
} from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

const TYPE_ICON = {
  video: Video,
  audio: Music,
  text: FileText,
  quiz: HelpCircle,
  download: Download,
  form: ExternalLink,
  text_assignment: ClipboardList,
};
const TYPE_COLOR = {
  video: "text-red-500",
  audio: "text-purple-500",
  text: "text-blue-500",
  quiz: "text-amber-500",
  download: "text-emerald-500",
  form: "text-pink-500",
  text_assignment: "text-teal-500",
};
const TYPE_LABEL: Partial<Record<keyof typeof TYPE_ICON, string>> = {
  text_assignment: "Task",
};

export default async function CourseLibraryCourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const currentUser = await getCurrentUser();

  const [course] = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .limit(1);

  if (!course) notFound();

  const modules = await db
    .select()
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .orderBy(asc(courseLibraryModules.sortOrder));

  const moduleIds = modules.map((m) => m.id);
  const lessons =
    moduleIds.length > 0
      ? await db
          .select()
          .from(courseLibraryLessons)
          .where(
            and(
              inArray(courseLibraryLessons.moduleId, moduleIds),
              isNull(courseLibraryLessons.deletedAt),
            ),
          )
          .orderBy(asc(courseLibraryLessons.sortOrder))
      : [];

  const progressRows =
    currentUser && lessons.length > 0
      ? await db
          .select({
            lessonId: courseLibraryLessonProgress.lessonId,
            completedAt: courseLibraryLessonProgress.completedAt,
            updatedAt: courseLibraryLessonProgress.updatedAt,
          })
          .from(courseLibraryLessonProgress)
          .where(
            and(
              eq(courseLibraryLessonProgress.userId, currentUser.id),
              inArray(
                courseLibraryLessonProgress.lessonId,
                lessons.map((lesson) => lesson.id),
              ),
            ),
          )
          .orderBy(desc(courseLibraryLessonProgress.updatedAt))
      : [];

  const progressMap = new Map(
    progressRows.map((row) => [row.lessonId, row]),
  );
  const completedLessonIds = new Set(
    progressRows.filter((row) => row.completedAt).map((row) => row.lessonId),
  );
  const currentLessonId =
    progressRows.find((row) => !row.completedAt)?.lessonId ??
    lessons.find((lesson) => !completedLessonIds.has(lesson.id))?.id ??
    null;

  const lessonsByModule = new Map<string, typeof lessons>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l);
    lessonsByModule.set(l.moduleId, list);
  }

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href="/dashboard/course-library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to courses
        </Link>

        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">{course.title}</h1>
          {course.summary && (
            <p className="mt-2 text-sm text-muted-foreground">{course.summary}</p>
          )}
        </header>

        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Progress
              </p>
              <p className="mt-1 text-sm text-foreground">
                {completedLessonIds.size} of {lessons.length} lessons complete
              </p>
              {currentLessonId ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Resume from the current lesson below.
                </p>
              ) : lessons.length > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  You have completed this course.
                </p>
              ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:w-64">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width:
                    lessons.length > 0
                      ? `${Math.round((completedLessonIds.size / lessons.length) * 100)}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        </div>

        {modules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This course has no lessons yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((mod) => {
              const modLessons = lessonsByModule.get(mod.id) ?? [];
              return (
                <div
                  key={mod.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border bg-muted/20">
                    <h2 className="text-sm font-semibold text-foreground">
                      {mod.title}
                    </h2>
                  </div>
                  <div className="divide-y divide-border">
                    {modLessons.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground italic">
                        No lessons in this module yet.
                      </p>
                    ) : (
                      modLessons.map((lesson) => {
                        const Icon = TYPE_ICON[lesson.lessonType];
                        const color = TYPE_COLOR[lesson.lessonType];
                        const progress = progressMap.get(lesson.id);
                        const isCompleted = !!progress?.completedAt;
                        const isCurrent = currentLessonId === lesson.id && !isCompleted;
                        return (
                          <Link
                            key={lesson.id}
                            href={`/dashboard/course-library/${courseId}/lessons/${lesson.id}`}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                              isCompleted && "bg-emerald-500/5",
                              isCurrent && "bg-primary/5 ring-1 ring-primary/20",
                            )}
                          >
                            <Icon className={cn("w-4 h-4 shrink-0", color)} />
                            <span className="text-xs text-muted-foreground uppercase font-medium w-16">
                              {TYPE_LABEL[lesson.lessonType] ?? lesson.lessonType}
                            </span>
                            <span className="flex-1 text-sm text-foreground">
                              {lesson.title}
                            </span>
                            {isCurrent ? (
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                Current
                              </span>
                            ) : isCompleted ? (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                Done
                              </span>
                            ) : null}
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
