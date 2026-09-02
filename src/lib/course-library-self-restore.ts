export const COMPLETE_COURSE_TARGET = "__complete_course__";

export type SelfRestoreCourse = {
  id: string;
  modules: Array<{
    lessonIds: string[];
    completedLessonIds: string[];
  }>;
};

export type SelfRestoreSelection = {
  courseId: string;
  target: string;
};

export type SelfRestorePlan = {
  selections: SelfRestoreSelection[];
  missingCompletionLessonIds: string[];
};

/**
 * Plan a one-time, forward-only migration restore.
 *
 * A selected lesson remains the learner's next lesson; only unfinished
 * lessons before it are completed. Selecting the course-complete sentinel
 * completes any unfinished lesson in that course. Existing completion is
 * never reopened and no learning artifacts are deleted.
 */
export function planCourseLibrarySelfRestore(input: {
  courses: SelfRestoreCourse[];
  selections: SelfRestoreSelection[];
}): SelfRestorePlan {
  const coursesById = new Map(
    input.courses.map((course) => [course.id, course])
  );
  const selectedCourseIds = new Set<string>();
  const missingCompletionLessonIds = new Set<string>();
  const selections: SelfRestoreSelection[] = [];

  for (const selection of input.selections) {
    if (selectedCourseIds.has(selection.courseId)) {
      throw new Error("Choose only one restore point for each course");
    }

    const course = coursesById.get(selection.courseId);
    if (!course) {
      throw new Error("A selected course is not available to this student");
    }

    const lessonIds = course.modules.flatMap((module) => module.lessonIds);
    const completedLessonIds = new Set(
      course.modules.flatMap((module) => module.completedLessonIds)
    );
    const targetIndex =
      selection.target === COMPLETE_COURSE_TARGET
        ? lessonIds.length
        : lessonIds.indexOf(selection.target);

    if (targetIndex < 0) {
      throw new Error("A selected lesson does not belong to its course");
    }

    selectedCourseIds.add(selection.courseId);
    selections.push(selection);

    for (const lessonId of lessonIds.slice(0, targetIndex)) {
      if (!completedLessonIds.has(lessonId)) {
        missingCompletionLessonIds.add(lessonId);
      }
    }
  }

  return {
    selections,
    missingCompletionLessonIds: Array.from(missingCompletionLessonIds),
  };
}
