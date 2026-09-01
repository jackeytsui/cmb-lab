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

export type ManualLessonPositionPlan = {
  targetLessonId: string;
  lessonIdsBeforeTarget: string[];
  lessonIdsFromTarget: string[];
  missingPrerequisiteLessonIds: string[];
  completedLessonIdsToReopen: string[];
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

/**
 * Plan an exact Course Library restart point without deleting learning data.
 *
 * Every lesson before the selected lesson becomes complete. The selected
 * lesson and every lesson after it become incomplete, making the selection the
 * learner's next lesson. Only `completedAt` is changed by the caller; quiz
 * answers, submissions, recordings, video history, and notes stay intact.
 */
export function planManualLessonPosition(input: {
  orderedModules: ManualUnlockModule[];
  targetLessonId: string;
  completedLessonIds: Iterable<string>;
}): ManualLessonPositionPlan {
  const orderedLessonIds: string[] = [];
  const seenLessonIds = new Set<string>();

  for (const chapter of input.orderedModules) {
    for (const lessonId of chapter.lessonIds) {
      if (seenLessonIds.has(lessonId)) continue;
      seenLessonIds.add(lessonId);
      orderedLessonIds.push(lessonId);
    }
  }

  const targetIndex = orderedLessonIds.indexOf(input.targetLessonId);
  if (targetIndex < 0) {
    throw new Error("Target lesson was not found in this course");
  }

  const completed = new Set(input.completedLessonIds);
  const lessonIdsBeforeTarget = orderedLessonIds.slice(0, targetIndex);
  const lessonIdsFromTarget = orderedLessonIds.slice(targetIndex);

  return {
    targetLessonId: input.targetLessonId,
    lessonIdsBeforeTarget,
    lessonIdsFromTarget,
    missingPrerequisiteLessonIds: lessonIdsBeforeTarget.filter(
      (lessonId) => !completed.has(lessonId),
    ),
    completedLessonIdsToReopen: lessonIdsFromTarget.filter((lessonId) =>
      completed.has(lessonId),
    ),
  };
}
