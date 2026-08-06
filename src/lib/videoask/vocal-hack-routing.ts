export type VideoAskDestinationFocus = {
  courseId: string | null;
  moduleId: string | null;
  lessonId: string | null;
};

type SearchParamValue = string | string[] | undefined;

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanId(value: SearchParamValue) {
  const id = firstSearchParam(value)?.trim();
  return id || null;
}

export function videoAskDestinationFocusFromSearchParams(params: {
  courseId?: SearchParamValue;
  moduleId?: SearchParamValue;
  lessonId?: SearchParamValue;
}): VideoAskDestinationFocus | null {
  const focus = {
    courseId: cleanId(params.courseId),
    moduleId: cleanId(params.moduleId),
    lessonId: cleanId(params.lessonId),
  };

  return focus.courseId || focus.moduleId || focus.lessonId ? focus : null;
}

export function videoAskMigrationHref(
  focus?: Partial<VideoAskDestinationFocus>,
) {
  const params = new URLSearchParams();
  if (focus?.courseId) params.set("courseId", focus.courseId);
  if (focus?.moduleId) params.set("moduleId", focus.moduleId);
  if (focus?.lessonId) params.set("lessonId", focus.lessonId);
  const query = params.toString();
  return `/admin/integrations/videoask${query ? `?${query}` : ""}`;
}

export function matchesVideoAskDestination(
  target: {
    targetCourseId?: string | null;
    targetModuleId?: string | null;
    targetLessonId?: string | null;
    publishedLessonId?: string | null;
  },
  focus: VideoAskDestinationFocus | null,
) {
  if (!focus) return true;
  if (focus.lessonId) {
    return (
      target.targetLessonId === focus.lessonId ||
      target.publishedLessonId === focus.lessonId
    );
  }
  if (focus.moduleId) return target.targetModuleId === focus.moduleId;
  if (focus.courseId) return target.targetCourseId === focus.courseId;
  return true;
}

export function courseLibraryReturnHref(focus: VideoAskDestinationFocus | null) {
  if (!focus?.courseId) return "/admin/course-library";
  if (focus.lessonId) {
    return `/admin/course-library/${encodeURIComponent(focus.courseId)}/lessons/${encodeURIComponent(focus.lessonId)}`;
  }
  return `/admin/course-library/${encodeURIComponent(focus.courseId)}`;
}
