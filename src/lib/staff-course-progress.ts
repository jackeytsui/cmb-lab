/**
 * A read-time course progress override, never a persisted completion.
 * Pass the effective viewer's database role (including View As), not the
 * signed-in administrator's role or a client-supplied flag.
 */
export function hasDefaultCourseCompletion(role: unknown): boolean {
  return role === "admin" || role === "coach";
}

export function displayedCompletedLessonCount(
  role: unknown,
  totalLessons: number,
  recordedCompletedLessons: number,
): number {
  return hasDefaultCourseCompletion(role)
    ? totalLessons
    : recordedCompletedLessons;
}

export function displayedCompletedLessonIds(
  role: unknown,
  lessons: readonly { id: string }[],
  progress: readonly { lessonId: string; completedAt: Date | null }[],
): Set<string> {
  if (hasDefaultCourseCompletion(role)) {
    return new Set(lessons.map((lesson) => lesson.id));
  }
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  return new Set(
    progress
      .filter((row) => row.completedAt && lessonIds.has(row.lessonId))
      .map((row) => row.lessonId),
  );
}
