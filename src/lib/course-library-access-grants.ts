export interface CoursePerStudentGrants {
  id: string;
  allowedUserIds: string[] | null | undefined;
  systemAccessUserIds: string[] | null | undefined;
}

/** True when either a deliberate exception or an automated import grants access. */
export function hasPerStudentCourseGrant(
  course: Pick<
    CoursePerStudentGrants,
    "allowedUserIds" | "systemAccessUserIds"
  >,
  userId: string,
): boolean {
  return (
    (Array.isArray(course.allowedUserIds) &&
      course.allowedUserIds.includes(userId)) ||
    (Array.isArray(course.systemAccessUserIds) &&
      course.systemAccessUserIds.includes(userId))
  );
}

/** Resolve per-student grants for every course, including non-custom courses. */
export function getPerStudentGrantedCourseIds(
  courses: CoursePerStudentGrants[],
  userId: string,
): Set<string> {
  return new Set(
    courses
      .filter((course) => hasPerStudentCourseGrant(course, userId))
      .map((course) => course.id),
  );
}

/** Resolve tag access versus precise student enrollment for one course. */
export function resolveCourseLibraryCourseAccess(params: {
  isCustomized: boolean;
  isCoreProgressCourse: boolean;
  progressGated: boolean;
  hasPerStudentGrant: boolean;
  baseAllowed: boolean;
}): boolean {
  if (params.isCustomized) return params.hasPerStudentGrant;
  if (params.progressGated && params.isCoreProgressCourse) {
    return params.hasPerStudentGrant;
  }
  return params.baseAllowed;
}
