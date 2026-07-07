import type { CourseLibraryCourseStatus } from "@/db/schema/course-library";

// ---------------------------------------------------------------------------
// Course Library visibility.
//
// - published: visible to everyone with the course_library feature
// - preview:   visible only to staff (admin/coach) to review before launch
// - draft:     not visible on the student-facing library (admin area only)
//
// Note: getCurrentUser() honours admin "View As" impersonation, so an admin
// simulating a student correctly sees only published courses. Use getRealUser
// in API routes where authorization should ignore impersonation.
// ---------------------------------------------------------------------------

export function isCourseLibraryStaff(
  role: string | null | undefined,
): boolean {
  return role === "admin" || role === "coach";
}

/** Course statuses visible on the student-facing library for this viewer. */
export function visibleCourseStatuses(
  role: string | null | undefined,
): CourseLibraryCourseStatus[] {
  return isCourseLibraryStaff(role)
    ? ["published", "preview"]
    : ["published"];
}
