import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { CourseMap, type CourseMapStop } from "@/components/course-library/CourseMap";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

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
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(currentUser?.role),
        ),
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
          .select({
            id: courseLibraryLessons.id,
            moduleId: courseLibraryLessons.moduleId,
          })
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
    progressRows.filter((row) => row.completedAt).map((row) => row.lessonId),
  );

  const lessonsByModule = new Map<string, string[]>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.moduleId, list);
  }

  const stops: CourseMapStop[] = modules.map((mod) => {
    const modLessonIds = lessonsByModule.get(mod.id) ?? [];
    const completedCount = modLessonIds.filter((id) =>
      completedLessonIds.has(id),
    ).length;
    return {
      id: mod.id,
      title: mod.title,
      shortTitle: mod.shortTitle,
      mapStyle: mod.mapStyle,
      weekLabel: mod.weekLabel,
      lessonCount: modLessonIds.length,
      completedCount,
      isComplete: modLessonIds.length > 0 && completedCount === modLessonIds.length,
    };
  });

  // The stop the student should do next: first stop with unfinished subpages.
  const currentIndex = stops.findIndex(
    (stop) => stop.lessonCount > 0 && !stop.isComplete,
  );
  const completedStops = stops.filter((stop) => stop.isComplete).length;
  const totalTrackedStops = stops.filter((stop) => stop.lessonCount > 0).length;

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href="/dashboard/course-library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to courses
        </Link>

        <header className="mx-auto mb-2 max-w-md">
          <div
            className="rounded-2xl px-5 py-4 text-white"
            style={{
              background: "linear-gradient(135deg, #2e3a97 0%, #3d4bb8 100%)",
              boxShadow: "0 4px 0 #1f2870",
            }}
          >
            <h1 className="text-xl font-extrabold">{course.title}</h1>
            {course.summary && (
              <p className="mt-1 text-sm text-white/80">{course.summary}</p>
            )}
            {totalTrackedStops > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-semibold text-white/90">
                  <span>
                    {completedStops} of {totalTrackedStops} stops complete
                  </span>
                  <span>
                    {Math.round((completedStops / totalTrackedStops) * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{
                      width: `${Math.round((completedStops / totalTrackedStops) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </header>

        {stops.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This course has no lessons yet.
            </p>
          </div>
        ) : (
          <CourseMap
            courseId={courseId}
            stops={stops}
            currentIndex={currentIndex}
          />
        )}
      </div>
    </FeatureGate>
  );
}
