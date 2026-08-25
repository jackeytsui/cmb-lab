/**
 * Same-origin course cover URL with a stable cache version.
 *
 * The proxy route is keyed by course ID, so replacing a cover does not change
 * its pathname. Including the course update timestamp gives the browser a new
 * cache key after a successful replacement while preserving caching between
 * changes.
 */
export function courseCoverImagePath(
  courseId: string,
  updatedAt: Date | string | number,
): string {
  const version =
    updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);

  return `/api/course-library/course-image/${encodeURIComponent(courseId)}?v=${encodeURIComponent(version)}`;
}
