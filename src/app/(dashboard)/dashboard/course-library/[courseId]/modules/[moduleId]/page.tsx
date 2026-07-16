import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  FileText,
  HelpCircle,
  Download,
  Music,
  ExternalLink,
  ClipboardList,
  Headphones,
  Mic,
  NotebookPen,
} from "lucide-react";
import { CourseLibraryGate } from "@/components/course-library/CourseLibraryGate";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";
import { baseLessonType, isCantoneseLessonType } from "@/lib/lesson-language";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ courseId: string; moduleId: string }>;
}

const TYPE_ICON = {
  video: Video,
  audio: Music,
  text: FileText,
  quiz: HelpCircle,
  download: Download,
  form: ExternalLink,
  text_assignment: ClipboardList,
  listening_practice: Headphones,
  vocal_hack: Mic,
  diary: NotebookPen,
};
const TYPE_COLOR = {
  video: "text-red-500",
  audio: "text-purple-500",
  text: "text-blue-500",
  quiz: "text-amber-500",
  download: "text-emerald-500",
  form: "text-pink-500",
  text_assignment: "text-teal-500",
  listening_practice: "text-indigo-500",
  vocal_hack: "text-rose-500",
  diary: "text-sky-500",
};
const TYPE_LABEL: Partial<Record<keyof typeof TYPE_ICON, string>> = {
  text_assignment: "Task",
  listening_practice: "Listening",
  vocal_hack: "Vocal Hack",
  diary: "Diary",
};

const MAP_STYLE_CHIP: Record<string, { label: string; className: string } | null> = {
  lesson: null,
  cm_school: {
    label: "CM School",
    className: "bg-[#4a9fe3]/15 text-[#2f7fc2] border-[#4a9fe3]/30",
  },
  custom_goal: {
    label: "Custom Goal",
    className: "bg-[#f2b705]/15 text-[#a37a02] border-[#f2b705]/40",
  },
};

export default async function CourseLibraryModulePage({ params }: PageProps) {
  const { courseId, moduleId } = await params;
  const currentUser = await getCurrentUser();

  const [row] = await db
    .select({
      module: courseLibraryModules,
      courseTitle: courseLibraryCourses.title,
    })
    .from(courseLibraryModules)
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        eq(courseLibraryCourses.id, courseId),
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

  const canSeeCourse = await getCourseLibraryCourseAccess(currentUser);
  if (!canSeeCourse(courseId)) notFound();

  const mod = row.module;

  const lessons = await db
    .select()
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.moduleId, moduleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .orderBy(asc(courseLibraryLessons.sortOrder));

  const progressRows =
    currentUser && lessons.length > 0
      ? await db
          .select({
            lessonId: courseLibraryLessonProgress.lessonId,
            completedAt: courseLibraryLessonProgress.completedAt,
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
      : [];

  const completedLessonIds = new Set(
    progressRows.filter((r) => r.completedAt).map((r) => r.lessonId),
  );
  const currentLessonId =
    lessons.find((lesson) => !completedLessonIds.has(lesson.id))?.id ?? null;
  const isModuleComplete =
    lessons.length > 0 && completedLessonIds.size === lessons.length;

  // Next stop on the map, if any.
  const [nextModule] = await db
    .select({
      id: courseLibraryModules.id,
      title: courseLibraryModules.title,
      shortTitle: courseLibraryModules.shortTitle,
    })
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
        gt(courseLibraryModules.sortOrder, mod.sortOrder),
      ),
    )
    .orderBy(asc(courseLibraryModules.sortOrder))
    .limit(1);

  const chip = MAP_STYLE_CHIP[mod.mapStyle] ?? null;

  return (
    <CourseLibraryGate>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href={`/dashboard/course-library/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {row.courseTitle} map
        </Link>

        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {mod.weekLabel && (
              <span className="rounded-full border border-[#2e3a97]/30 bg-[#2e3a97]/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2e3a97] dark:text-[#8b96e8]">
                {mod.weekLabel}
              </span>
            )}
            {chip && (
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-foreground">{mod.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {lessons.length === 0
              ? "No content in this stop yet."
              : isModuleComplete
                ? "You have completed every part of this stop. 🎉"
                : `${completedLessonIds.size} of ${lessons.length} parts complete`}
          </p>
        </header>

        {lessons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Content for this stop is coming soon.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            {lessons.map((lesson) => {
              // Cantonese variants share the base type's icon/colour/label; the
              // "(Canto)" suffix marks the language.
              const baseType = baseLessonType(
                lesson.lessonType,
              ) as keyof typeof TYPE_ICON;
              const Icon = TYPE_ICON[baseType];
              const color = TYPE_COLOR[baseType];
              const typeLabel = `${TYPE_LABEL[baseType] ?? baseType}${
                isCantoneseLessonType(lesson.lessonType) ? " (Canto)" : ""
              }`;
              const isCompleted = completedLessonIds.has(lesson.id);
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
                    {typeLabel}
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
            })}
          </div>
        )}

        {nextModule && isModuleComplete && (
          <Link
            href={`/dashboard/course-library/${courseId}/modules/${nextModule.id}`}
            className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next stop
              </p>
              <p className="text-sm font-semibold text-foreground">
                {nextModule.shortTitle?.trim() || nextModule.title}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </Link>
        )}
      </div>
    </CourseLibraryGate>
  );
}
