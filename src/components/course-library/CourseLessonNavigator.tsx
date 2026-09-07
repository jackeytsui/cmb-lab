import Link from "next/link";
import { Check, Circle, Map } from "lucide-react";
import { cn } from "@/lib/utils";

export type CourseLessonNavigatorItem = {
  lessonId: string;
  lessonTitle: string;
  moduleId: string;
  moduleTitle: string;
  moduleShortTitle: string | null;
  weekLabel: string | null;
};

function NavigatorContents({
  courseId,
  currentLessonId,
  lessons,
  completedLessonIds,
}: {
  courseId: string;
  currentLessonId: string;
  lessons: CourseLessonNavigatorItem[];
  completedLessonIds: Set<string>;
}) {
  const modules = lessons.reduce<
    Array<{
      id: string;
      title: string;
      weekLabel: string | null;
      lessons: CourseLessonNavigatorItem[];
    }>
  >((groups, lesson) => {
    const last = groups.at(-1);
    if (last?.id === lesson.moduleId) {
      last.lessons.push(lesson);
    } else {
      groups.push({
        id: lesson.moduleId,
        title: lesson.moduleShortTitle || lesson.moduleTitle,
        weekLabel: lesson.weekLabel,
        lessons: [lesson],
      });
    }
    return groups;
  }, []);

  return (
    <div className="max-h-[calc(100vh-8rem)] space-y-3 overflow-y-auto p-4">
      {modules.map((module) => {
        const completed = module.lessons.filter((lesson) =>
          completedLessonIds.has(lesson.lessonId),
        ).length;
        const isCurrentModule = module.lessons.some(
          (lesson) => lesson.lessonId === currentLessonId,
        );

        return (
          <section key={module.id} aria-label={module.title}>
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div>
                {module.weekLabel && (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {module.weekLabel}
                  </p>
                )}
                <p
                  className={cn(
                    "text-xs font-semibold leading-4 text-foreground",
                    isCurrentModule && "text-primary",
                  )}
                >
                  {module.title}
                </p>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {completed}/{module.lessons.length}
              </span>
            </div>
            <div className="space-y-1 border-l border-border pl-2">
              {module.lessons.map((lesson) => {
                const isCurrent = lesson.lessonId === currentLessonId;
                const isCompleted = completedLessonIds.has(lesson.lessonId);
                const StatusIcon = isCompleted ? Check : Circle;
                return (
                  <Link
                    key={lesson.lessonId}
                    href={`/course-library/${courseId}/lessons/${lesson.lessonId}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      isCurrent && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <StatusIcon
                      className={cn(
                        "mt-0.5 h-3 w-3 shrink-0",
                        isCompleted && "text-emerald-600",
                      )}
                      aria-hidden="true"
                    />
                    <span>{lesson.lessonTitle}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CourseLessonNavigator({
  courseId,
  currentLessonId,
  lessons,
  completedLessonIds,
}: {
  courseId: string;
  currentLessonId: string;
  lessons: CourseLessonNavigatorItem[];
  completedLessonIds: Set<string>;
}) {
  const contentProps = {
    courseId,
    currentLessonId,
    lessons,
    completedLessonIds,
  };

  return (
    <>
      <details className="group rounded-lg border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <Map className="h-4 w-4 text-primary" aria-hidden="true" />
          Course roadmap
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
            Show
          </span>
          <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">
            Hide
          </span>
        </summary>
        <NavigatorContents {...contentProps} />
      </details>
      <nav
        aria-label="Course roadmap"
        className="hidden rounded-lg border border-border bg-card lg:block"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Map className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Course roadmap</h2>
        </div>
        <NavigatorContents {...contentProps} />
      </nav>
    </>
  );
}
