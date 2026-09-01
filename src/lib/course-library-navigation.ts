export const COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE = "progress-locked";

export function courseLibraryProgressLockedHref(courseId: string): string {
  return `/course-library/${encodeURIComponent(courseId)}?notice=${COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE}`;
}

export function hasCourseLibraryProgressLockedNotice(
  notice: string | string[] | undefined,
): boolean {
  return Array.isArray(notice)
    ? notice.includes(COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE)
    : notice === COURSE_LIBRARY_PROGRESS_LOCKED_NOTICE;
}
