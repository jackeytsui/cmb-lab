export type CourseLibraryModuleProgress = {
  id: string;
  lessonCount: number;
  completedCount: number;
};

export function getCurrentCourseLibraryModuleIndex(
  modules: readonly CourseLibraryModuleProgress[],
): number {
  return modules.findIndex(
    (module) =>
      module.lessonCount > 0 && module.completedCount < module.lessonCount,
  );
}

/**
 * Match the Course Library roadmap exactly: completed chapters remain
 * revisitable, the first unfinished chapter is current, and later chapters
 * stay locked. Empty chapters before the current chapter remain visible.
 */
export function canAccessCourseLibraryModuleByProgress(
  modules: readonly CourseLibraryModuleProgress[],
  targetModuleId: string,
): boolean {
  const targetIndex = modules.findIndex(
    (module) => module.id === targetModuleId,
  );
  if (targetIndex < 0) return false;

  const target = modules[targetIndex];
  if (
    target.lessonCount > 0 &&
    target.completedCount >= target.lessonCount
  ) {
    return true;
  }

  const currentIndex = getCurrentCourseLibraryModuleIndex(modules);
  if (currentIndex < 0) return true;
  return targetIndex <= currentIndex;
}
