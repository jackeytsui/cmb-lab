import Link from "next/link";
import { BookOpen } from "lucide-react";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

export const metadata = {
  title: "Course Library",
};

export default async function CourseLibraryStudentPage() {
  const currentUser = await getCurrentUser();
  const statuses = visibleCourseStatuses(currentUser?.role);
  const canSeeCourse = await getCourseLibraryCourseAccess(currentUser);

  const allCourses = await db
    .select()
    .from(courseLibraryCourses)
    .where(
      and(
        isNull(courseLibraryCourses.deletedAt),
        inArray(courseLibraryCourses.status, statuses),
      ),
    )
    .orderBy(asc(courseLibraryCourses.sortOrder));

  // Tag-based visibility: courses with tag grants are only shown to students
  // holding one of the granting tags (managed in Admin > Tag Management).
  const courses = allCourses.filter((course) => canSeeCourse(course.id));

  const courseIds = courses.map((course) => course.id);
  const progressByCourse = new Map<
    string,
    { totalLessons: number; completedLessons: number }
  >();

  if (currentUser && courseIds.length > 0) {
    const progressRows = await db
      .select({
        courseId: courseLibraryCourses.id,
        totalLessons: sql<number>`COUNT(DISTINCT ${courseLibraryLessons.id})`.as(
          "total_lessons",
        ),
        completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL THEN ${courseLibraryLessonProgress.lessonId} END)`.as(
          "completed_lessons",
        ),
      })
      .from(courseLibraryCourses)
      .leftJoin(
        courseLibraryModules,
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
      )
      .leftJoin(
        courseLibraryLessons,
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
      )
      .leftJoin(
        courseLibraryLessonProgress,
        and(
          eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
          eq(courseLibraryLessonProgress.userId, currentUser.id),
        ),
      )
      .where(
        and(
          isNull(courseLibraryCourses.deletedAt),
          inArray(courseLibraryCourses.status, statuses),
          inArray(courseLibraryCourses.id, courseIds),
        ),
      )
      .groupBy(courseLibraryCourses.id);

    for (const row of progressRows) {
      progressByCourse.set(row.courseId, {
        totalLessons: Number(row.totalLessons ?? 0),
        completedLessons: Number(row.completedLessons ?? 0),
      });
    }
  }

  return (
    <FeatureGate feature="course_library">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Course Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse available courses and track your progress.
          </p>
        </header>

        {courses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No courses available yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => {
              const progress = progressByCourse.get(course.id) ?? {
                totalLessons: 0,
                completedLessons: 0,
              };
              const percent =
                progress.totalLessons > 0
                  ? Math.round(
                      (progress.completedLessons / progress.totalLessons) * 100,
                    )
                  : 0;

              return (
                <Link
                  key={course.id}
                  href={`/dashboard/course-library/${course.id}`}
                  className="group rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                >
                  <div className="aspect-video bg-muted relative">
                    {course.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.coverImageUrl}
                        alt={course.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <BookOpen className="w-12 h-12" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                      {course.title}
                    </h3>
                    {course.summary && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {course.summary}
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {progress.completedLessons} of {progress.totalLessons} done
                        </span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
