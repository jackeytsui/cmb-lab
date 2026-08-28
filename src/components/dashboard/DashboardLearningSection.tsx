import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Play,
  Sparkles,
} from "lucide-react";
import type { DashboardLearningCourse } from "@/lib/dashboard-learning";
import { courseCoverImagePath } from "@/lib/course-cover-image";

function courseHref(course: DashboardLearningCourse) {
  return course.nextLessonId
    ? `/dashboard/course-library/${course.id}/lessons/${course.nextLessonId}`
    : `/dashboard/course-library/${course.id}`;
}

function actionLabel(course: DashboardLearningCourse) {
  if (course.isComplete) return "Review course";
  return course.isStarted ? "Continue lesson" : "Start course";
}

function CourseArtwork({
  course,
  className,
}: {
  course: DashboardLearningCourse;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-[#26307f] via-[#3949b6] to-[#4a9fe3] ${className}`}
    >
      {course.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img
          src={courseCoverImagePath(course.id, course.coverUpdatedAt)}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 left-6 h-32 w-32 rounded-full bg-[#f2b705]/25 blur-sm" />
          <BookOpenCheck className="absolute bottom-5 right-5 h-12 w-12 text-white/80" />
        </>
      )}
    </div>
  );
}

export function DashboardLearningSection({
  courses,
}: {
  courses: DashboardLearningCourse[];
}) {
  if (courses.length === 0) {
    return (
      <section aria-labelledby="assigned-courses-heading" className="space-y-3">
        <div>
          <h2
            id="assigned-courses-heading"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Your courses
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only courses included in your access appear here.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
          <BookOpenCheck className="mx-auto h-9 w-9 text-primary/40" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No assigned courses yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask your coach if you expected a course to be available here.
          </p>
        </div>
      </section>
    );
  }

  const [primaryCourse, ...remainingCourses] = courses;

  return (
    <section aria-labelledby="assigned-courses-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            </span>
            <h2
              id="assigned-courses-heading"
              className="text-xl font-bold tracking-tight text-foreground"
            >
              Continue learning
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick up from your latest activity. Only courses included in your access are shown.
          </p>
        </div>
        <Link
          href="/dashboard/course-library"
          className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 sm:inline-flex"
        >
          View all
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <Link
        href={courseHref(primaryCourse)}
        data-testid="primary-course-resume"
        className="group grid overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-[#4a9fe3]/10 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:grid-cols-[minmax(0,1fr)_220px]"
      >
        <div className="flex min-w-0 flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {primaryCourse.isComplete ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {primaryCourse.isComplete
                  ? "Course complete"
                  : primaryCourse.isStarted
                    ? "Continue where you left off"
                    : "Ready to start"}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {primaryCourse.title}
            </h3>
            {primaryCourse.nextLessonTitle ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {primaryCourse.nextModuleTitle}
                </span>
                <span className="mx-1.5 text-border">/</span>
                {primaryCourse.nextLessonTitle}
              </p>
            ) : primaryCourse.summary ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {primaryCourse.summary}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {primaryCourse.completedLessons} of {primaryCourse.totalLessons} lessons
              </span>
              <span className="font-bold text-primary">
                {primaryCourse.percentComplete}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2e3a97] to-[#4a9fe3]"
                style={{ width: `${primaryCourse.percentComplete}%` }}
              />
            </div>
            <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition group-hover:opacity-90">
              {actionLabel(primaryCourse)}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
        <CourseArtwork
          course={primaryCourse}
          className="order-first aspect-[16/8] sm:order-last sm:aspect-auto sm:min-h-[250px]"
        />
      </Link>

      {remainingCourses.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {remainingCourses.slice(0, 2).map((course) => (
            <Link
              key={course.id}
              href={courseHref(course)}
              className="group flex min-w-0 overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/35 hover:bg-primary/[0.025]"
            >
              <CourseArtwork course={course} className="w-24 shrink-0 sm:w-28" />
              <div className="min-w-0 flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                    {course.title}
                  </h3>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                  {course.isComplete
                    ? "Completed — review anytime"
                    : course.nextLessonTitle ?? "Ready to start"}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${course.percentComplete}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {course.percentComplete}%
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <Link
        href="/dashboard/course-library"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 sm:hidden"
      >
        View all courses
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
