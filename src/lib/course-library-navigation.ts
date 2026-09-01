export const COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE = "progress-locked";

export function courseLibraryProgressLockedHref(
  courseId: string,
  moduleId?: string,
): string {
  const params = new URLSearchParams({
    notice: COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE,
  });
  if (moduleId) params.set("jumpTo", moduleId);
  return `/course-library/${encodeURIComponent(courseId)}?${params.toString()}`;
}

export function hasCourseLibraryProgressLockedNotice(
  notice: string | string[] | undefined,
): boolean {
  return Array.isArray(notice)
    ? notice.includes(COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE)
    : notice === COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE;
}
