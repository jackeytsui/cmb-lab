export type ManualUnlockModule = {
  id: string;
  lessonIds: string[];
};

export type ManualChapterUnlockPlan = {
  targetModuleId: string;
  prerequisiteModuleIds: string[];
  prerequisiteLessonIds: string[];
  missingLessonIds: string[];
  alreadyCompletedLessonIds: string[];
};

/**
 * Plan a monotonic Course Library chapter unlock.
 *
 * Unlocking a chapter means completing every lesson in the chapters before it.
 * The selected chapter itself remains incomplete/current so staff do not erase
 * the learner's real work or accidentally skip the content they selected.
 */
export function planManualChapterUnlock(input: {
  orderedModules: ManualUnlockModule[];
  targetModuleId: string;
  completedLessonIds: Iterable<string>;
}): ManualChapterUnlockPlan {
  const targetIndex = input.orderedModules.findIndex(
    (module) => module.id === input.targetModuleId,
  );

  if (targetIndex < 0) {
    throw new Error("Target chapter was not found in this course");
  }

  const completed = new Set(input.completedLessonIds);
  const prerequisiteModules = input.orderedModules.slice(0, targetIndex);
  const prerequisiteLessonIds: string[] = [];
  const seenLessonIds = new Set<string>();

  for (const chapter of prerequisiteModules) {
    for (const lessonId of chapter.lessonIds) {
      if (seenLessonIds.has(lessonId)) continue;
      seenLessonIds.add(lessonId);
      prerequisiteLessonIds.push(lessonId);
    }
  }

  return {
    targetModuleId: input.targetModuleId,
    prerequisiteModuleIds: prerequisiteModules.map((chapter) => chapter.id),
    prerequisiteLessonIds,
    missingLessonIds: prerequisiteLessonIds.filter(
      (lessonId) => !completed.has(lessonId),
    ),
    alreadyCompletedLessonIds: prerequisiteLessonIds.filter((lessonId) =>
      completed.has(lessonId),
    ),
  };
}
