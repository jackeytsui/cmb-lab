export type DashboardLearningRow = {
  courseId: string;
  courseTitle: string;
  courseSummary: string;
  courseSortOrder: number;
  coverImageUrl: string | null;
  coverUpdatedAt: Date;
  moduleId: string | null;
  moduleTitle: string | null;
  moduleSortOrder: number | null;
  lessonId: string | null;
  lessonTitle: string | null;
  lessonSortOrder: number | null;
  progressId: string | null;
  completedAt: Date | null;
  progressUpdatedAt: Date | null;
};

export type DashboardLearningCourse = {
  id: string;
  title: string;
  summary: string;
  sortOrder: number;
  coverImageUrl: string | null;
  coverUpdatedAt: Date;
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  isStarted: boolean;
  isComplete: boolean;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  nextModuleId: string | null;
  nextModuleTitle: string | null;
  lastActivityAt: Date | null;
};

type OrderedLesson = {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  moduleSortOrder: number;
  lessonSortOrder: number;
  progressId: string | null;
  completedAt: Date | null;
  progressUpdatedAt: Date | null;
};

/**
 * Build the student-home course queue from the same visible Course Library
 * rows used by the learning surface. In-progress courses come first, ordered
 * by real learner activity, followed by new courses and completed courses.
 */
export function buildDashboardLearningCourses(
  rows: readonly DashboardLearningRow[],
): DashboardLearningCourse[] {
  const rowsByCourse = new Map<string, DashboardLearningRow[]>();

  for (const row of rows) {
    const courseRows = rowsByCourse.get(row.courseId) ?? [];
    courseRows.push(row);
    rowsByCourse.set(row.courseId, courseRows);
  }

  const courses = Array.from(rowsByCourse.values()).map((courseRows) => {
    const first = courseRows[0];
    const lessonsById = new Map<string, OrderedLesson>();

    for (const row of courseRows) {
      if (!row.lessonId || !row.lessonTitle || !row.moduleId || !row.moduleTitle) {
        continue;
      }
      lessonsById.set(row.lessonId, {
        id: row.lessonId,
        title: row.lessonTitle,
        moduleId: row.moduleId,
        moduleTitle: row.moduleTitle,
        moduleSortOrder: row.moduleSortOrder ?? 0,
        lessonSortOrder: row.lessonSortOrder ?? 0,
        progressId: row.progressId,
        completedAt: row.completedAt,
        progressUpdatedAt: row.progressUpdatedAt,
      });
    }

    const orderedLessons = Array.from(lessonsById.values()).sort(
      (a, b) =>
        a.moduleSortOrder - b.moduleSortOrder ||
        a.lessonSortOrder - b.lessonSortOrder ||
        a.title.localeCompare(b.title),
    );
    const completedLessons = orderedLessons.filter(
      (lesson) => lesson.completedAt !== null,
    ).length;
    const totalLessons = orderedLessons.length;
    const nextLesson = orderedLessons.find(
      (lesson) => lesson.completedAt === null,
    );
    const activityTimes = orderedLessons
      .map((lesson) => lesson.progressUpdatedAt?.getTime() ?? 0)
      .filter((time) => time > 0);
    const lastActivityAt =
      activityTimes.length > 0 ? new Date(Math.max(...activityTimes)) : null;

    return {
      id: first.courseId,
      title: first.courseTitle,
      summary: first.courseSummary,
      sortOrder: first.courseSortOrder,
      coverImageUrl: first.coverImageUrl,
      coverUpdatedAt: first.coverUpdatedAt,
      completedLessons,
      totalLessons,
      percentComplete:
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0,
      isStarted: orderedLessons.some((lesson) => lesson.progressId !== null),
      isComplete: totalLessons > 0 && completedLessons === totalLessons,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonTitle: nextLesson?.title ?? null,
      nextModuleId: nextLesson?.moduleId ?? null,
      nextModuleTitle: nextLesson?.moduleTitle ?? null,
      lastActivityAt,
    } satisfies DashboardLearningCourse;
  });

  return courses.sort((a, b) => {
    const aState = a.isComplete ? 2 : a.isStarted ? 0 : 1;
    const bState = b.isComplete ? 2 : b.isStarted ? 0 : 1;
    if (aState !== bState) return aState - bState;

    if (aState === 0 || aState === 2) {
      const activityDifference =
        (b.lastActivityAt?.getTime() ?? 0) -
        (a.lastActivityAt?.getTime() ?? 0);
      if (activityDifference !== 0) return activityDifference;
    }

    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });
}
