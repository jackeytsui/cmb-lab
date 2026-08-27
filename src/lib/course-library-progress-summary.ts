export type CourseLibraryProgressRow = {
  courseId: string;
  courseTitle: string;
  courseSortOrder: number;
  moduleTitle: string;
  moduleSortOrder: number;
  lessonId: string;
  lessonTitle: string;
  lessonSortOrder: number;
  progressId: string | null;
  completedAt: Date | null;
  progressUpdatedAt: Date | null;
};

export type CurrentCourseProgress = {
  courseId: string;
  courseTitle: string;
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  isComplete: boolean;
  nextLessonTitle: string | null;
  nextModuleTitle: string | null;
};

export type CourseLibraryAccessProgress = {
  coursesAccessible: number;
  lessonsCompleted: number;
  lessonsTotal: number;
};

type AccessibleCourseProgress = {
  modules: Array<{
    lessonIds: string[];
    completedLessonIds: string[];
  }>;
};

type CourseProgressCandidate = CurrentCourseProgress & {
  courseSortOrder: number;
  lastActivityAt: number;
};

/**
 * Select the course a learner is actively working through and summarize its
 * real CMB Lab lesson completion records. Courses without any learner activity
 * are ignored so an unrelated published course cannot become "current".
 */
export function selectCurrentCourseProgress(
  rows: CourseLibraryProgressRow[],
): CurrentCourseProgress | null {
  const rowsByCourse = new Map<string, CourseLibraryProgressRow[]>();

  for (const row of rows) {
    const courseRows = rowsByCourse.get(row.courseId) ?? [];
    courseRows.push(row);
    rowsByCourse.set(row.courseId, courseRows);
  }

  const candidates: CourseProgressCandidate[] = [];

  for (const courseRows of rowsByCourse.values()) {
    const hasActivity = courseRows.some((row) => row.progressId !== null);
    if (!hasActivity) continue;

    const orderedRows = [...courseRows].sort(
      (a, b) =>
        a.moduleSortOrder - b.moduleSortOrder ||
        a.lessonSortOrder - b.lessonSortOrder ||
        a.lessonTitle.localeCompare(b.lessonTitle),
    );
    const completedLessons = orderedRows.filter(
      (row) => row.completedAt !== null,
    ).length;
    const totalLessons = orderedRows.length;
    const nextLesson = orderedRows.find((row) => row.completedAt === null);
    const lastActivityAt = Math.max(
      ...orderedRows.map((row) => row.progressUpdatedAt?.getTime() ?? 0),
    );
    const firstRow = orderedRows[0];

    candidates.push({
      courseId: firstRow.courseId,
      courseTitle: firstRow.courseTitle,
      courseSortOrder: firstRow.courseSortOrder,
      completedLessons,
      totalLessons,
      percentComplete:
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0,
      isComplete: totalLessons > 0 && completedLessons === totalLessons,
      nextLessonTitle: nextLesson?.lessonTitle ?? null,
      nextModuleTitle: nextLesson?.moduleTitle ?? null,
      lastActivityAt,
    });
  }

  candidates.sort(
    (a, b) =>
      b.lastActivityAt - a.lastActivityAt ||
      a.courseSortOrder - b.courseSortOrder ||
      a.courseTitle.localeCompare(b.courseTitle),
  );

  const current = candidates[0];
  if (!current) return null;

  return {
    courseId: current.courseId,
    courseTitle: current.courseTitle,
    completedLessons: current.completedLessons,
    totalLessons: current.totalLessons,
    percentComplete: current.percentComplete,
    isComplete: current.isComplete,
    nextLessonTitle: current.nextLessonTitle,
    nextModuleTitle: current.nextModuleTitle,
  };
}

/** Aggregate the active Course Library access/progress shown on staff profiles. */
export function summarizeCourseLibraryAccessProgress(
  courses: AccessibleCourseProgress[],
): CourseLibraryAccessProgress {
  return courses.reduce<CourseLibraryAccessProgress>(
    (summary, course) => {
      summary.coursesAccessible += 1;
      for (const chapter of course.modules) {
        summary.lessonsTotal += chapter.lessonIds.length;
        summary.lessonsCompleted += chapter.completedLessonIds.length;
      }
      return summary;
    },
    { coursesAccessible: 0, lessonsCompleted: 0, lessonsTotal: 0 },
  );
}
