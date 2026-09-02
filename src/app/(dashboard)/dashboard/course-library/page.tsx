import { BookOpen } from "lucide-react";
import { CourseLibraryGate } from "@/components/course-library/CourseLibraryGate";
import { CourseLibraryCourseCard } from "@/components/course-library/CourseLibraryCourseCard";
import { CourseLibraryProgressRestoreBanner } from "@/components/course-library/CourseLibraryProgressRestoreBanner";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
  courseLibraryProgressRestoreDecisions,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccessPolicy } from "@/lib/tag-feature-access";
import { courseCoverImagePath } from "@/lib/course-cover-image";
import { getCourseLibraryCardStates } from "@/lib/course-library-roadmap-visibility";
import {
  displayedCompletedLessonCount,
  hasDefaultCourseCompletion,
} from "@/lib/staff-course-progress";
import { StaffCourseProgressNotice } from "@/components/course/StaffCourseProgressNotice";
import { loadStudentCourseLibraryProgress } from "@/lib/course-library-student-progress";

export const metadata = {
  title: "Course Library",
};

export default async function CourseLibraryStudentPage() {
  const [currentUser, realUser] = await Promise.all([
    getCurrentUser(),
    getRealUser(),
  ]);
  const statuses = visibleCourseStatuses(currentUser?.role);
  const canSelfRestore = Boolean(
    currentUser &&
      realUser &&
      currentUser.role === "student" &&
      realUser.role === "student" &&
      currentUser.id === realUser.id
  );
  const [accessPolicy, allCourses] = await Promise.all([
    getCourseLibraryCourseAccessPolicy(currentUser),
    db
      .select()
      .from(courseLibraryCourses)
      .where(
        and(
          isNull(courseLibraryCourses.deletedAt),
          inArray(courseLibraryCourses.status, statuses)
        )
      )
      .orderBy(asc(courseLibraryCourses.sortOrder)),
  ]);

  const restoreDecisionRows =
    canSelfRestore && currentUser
      ? await db
          .select({ id: courseLibraryProgressRestoreDecisions.id })
          .from(courseLibraryProgressRestoreDecisions)
          .where(
            eq(courseLibraryProgressRestoreDecisions.userId, currentUser.id)
          )
          .limit(1)
      : [];
  const restoreCourses =
    canSelfRestore && currentUser && restoreDecisionRows.length === 0
      ? await loadStudentCourseLibraryProgress(currentUser)
      : [];

  const cardStates = getCourseLibraryCardStates({
    courses: allCourses,
    canAccessCourse: accessPolicy.canAccessCourse,
    showLockedBlueprintRoadmap: accessPolicy.showLockedBlueprintRoadmap,
  });
  // Tag-based visibility still protects private courses. Later Blueprint
  // levels are the only denied courses that can appear, and only as locked
  // roadmap previews for an enrolled student.
  const courses = allCourses.filter((course) => cardStates.has(course.id));
  const hasLockedBlueprintCourse = courses.some(
    (course) => cardStates.get(course.id)?.locked
  );

  const courseIds = courses.map((course) => course.id);
  const progressByCourse = new Map<
    string,
    { totalLessons: number; completedLessons: number }
  >();

  if (currentUser && courseIds.length > 0) {
    const progressRows = await db
      .select({
        courseId: courseLibraryCourses.id,
        totalLessons:
          sql<number>`COUNT(DISTINCT ${courseLibraryLessons.id})`.as(
            "total_lessons"
          ),
        completedLessons:
          sql<number>`COUNT(DISTINCT CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL THEN ${courseLibraryLessonProgress.lessonId} END)`.as(
            "completed_lessons"
          ),
      })
      .from(courseLibraryCourses)
      .leftJoin(
        courseLibraryModules,
        and(
          eq(courseLibraryModules.courseId, courseLibraryCourses.id),
          isNull(courseLibraryModules.deletedAt)
        )
      )
      .leftJoin(
        courseLibraryLessons,
        and(
          eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
          isNull(courseLibraryLessons.deletedAt)
        )
      )
      .leftJoin(
        courseLibraryLessonProgress,
        and(
          eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
          eq(courseLibraryLessonProgress.userId, currentUser.id)
        )
      )
      .where(
        and(
          isNull(courseLibraryCourses.deletedAt),
          inArray(courseLibraryCourses.status, statuses),
          inArray(courseLibraryCourses.id, courseIds)
        )
      )
      .groupBy(courseLibraryCourses.id);

    for (const row of progressRows) {
      progressByCourse.set(row.courseId, {
        totalLessons: Number(row.totalLessons ?? 0),
        completedLessons: displayedCompletedLessonCount(
          currentUser.role,
          Number(row.totalLessons ?? 0),
          Number(row.completedLessons ?? 0)
        ),
      });
    }
  }

  const progressRestoreOptions =
    restoreDecisionRows.length === 0
      ? restoreCourses
          .map((course) => {
            const totalLessons = course.modules.reduce(
              (total, module) => total + module.lessonIds.length,
              0
            );
            const completedLessons = course.modules.reduce(
              (total, module) => total + module.completedLessonIds.length,
              0
            );

            return {
              id: course.id,
              title: course.title,
              totalLessons,
              completedLessons,
              modules: course.modules.map((module) => ({
                id: module.id,
                title: module.title,
                shortTitle: module.shortTitle,
                lessons: module.lessons.map((lesson) => ({
                  id: lesson.id,
                  title: lesson.title,
                })),
              })),
            };
          })
          .filter((course) => course.totalLessons > 0)
      : [];

  return (
    <CourseLibraryGate key={currentUser?.id}>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Course Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasLockedBlueprintCourse
              ? "Your full learning path is shown below. Complete each level to unlock the next."
              : "Browse available courses and track your progress."}
          </p>
        </header>

        <CourseLibraryProgressRestoreBanner courses={progressRestoreOptions} />

        {hasDefaultCourseCompletion(currentUser?.role) && (
          <StaffCourseProgressNotice />
        )}

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
              const cardState = cardStates.get(course.id)!;
              const progress = progressByCourse.get(course.id) ?? {
                totalLessons: 0,
                completedLessons: 0,
              };
              const percent =
                progress.totalLessons > 0
                  ? Math.round(
                      (progress.completedLessons / progress.totalLessons) * 100
                    )
                  : 0;

              return (
                <CourseLibraryCourseCard
                  key={course.id}
                  courseId={course.id}
                  title={course.title}
                  summary={course.summary}
                  coverImageSrc={
                    course.coverImageUrl
                      ? courseCoverImagePath(course.id, course.updatedAt)
                      : null
                  }
                  completedLessons={progress.completedLessons}
                  totalLessons={progress.totalLessons}
                  percent={percent}
                  locked={cardState.locked}
                  unlockRequirement={cardState.unlockRequirement}
                />
              );
            })}
          </div>
        )}
      </div>
    </CourseLibraryGate>
  );
}
