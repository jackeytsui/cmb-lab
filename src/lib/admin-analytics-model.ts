export type CompletionRow = {
  courseId: string;
  courseTitle: string;
  courseCount: number;
  totalLessons: number;
  enrolledStudents: number;
  activeStudents: number;
  completedStudents: number;
  completionRate: number;
  rowType: "course" | "customized_aggregate";
};

export type CompletionRowInput = Omit<
  CompletionRow,
  "courseCount" | "completionRate" | "rowType"
> & {
  isCustomized: boolean;
};

export const CUSTOMIZED_COURSES_AGGREGATE_ID = "customized-courses-combined";
export const SYSTEM_PROGRESS_BATCH_MINIMUM = 20;

/**
 * The GHL migration writes dozens of lesson-progress rows for one student in
 * the same minute. A real lesson visit only touches a handful. Keep those bulk
 * writes in completion totals, but exclude them from engagement signals.
 */
export function isLikelyStudentActivityBatch(recordCount: number): boolean {
  return recordCount < SYSTEM_PROGRESS_BATCH_MINIMUM;
}

/**
 * Customized courses use two naming conventions across the legacy LMS and
 * Course Library. Keep this in one place so the dashboard and exports group
 * both generations consistently.
 */
export function isCustomizedAnalyticsCourse(title: string): boolean {
  const normalized = title.trim();
  return (
    /customized/i.test(normalized) ||
    /^(mandarin|chinese)\s+for\s+/i.test(normalized)
  );
}

function completionRate(completed: number, enrolled: number): number {
  return enrolled > 0 ? Math.round((completed / enrolled) * 1000) / 10 : 0;
}

/**
 * Preserve management-facing products as individual rows and collapse the
 * long tail of one-off customized courses into one weighted summary row.
 * Counts in the aggregate are course access records (not unique people), so a
 * student enrolled in two customized courses contributes two accesses.
 */
export function aggregateCompletionRows(
  rows: CompletionRowInput[]
): CompletionRow[] {
  const individualRows: CompletionRow[] = [];
  const customizedRows: CompletionRowInput[] = [];

  for (const row of rows) {
    if (row.isCustomized) {
      customizedRows.push(row);
      continue;
    }

    individualRows.push({
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      courseCount: 1,
      totalLessons: row.totalLessons,
      enrolledStudents: row.enrolledStudents,
      activeStudents: row.activeStudents,
      completedStudents: row.completedStudents,
      completionRate: completionRate(
        row.completedStudents,
        row.enrolledStudents
      ),
      rowType: "course",
    });
  }

  if (customizedRows.length > 0) {
    const aggregate = customizedRows.reduce(
      (totals, row) => ({
        totalLessons: totals.totalLessons + row.totalLessons,
        enrolledStudents: totals.enrolledStudents + row.enrolledStudents,
        activeStudents: totals.activeStudents + row.activeStudents,
        completedStudents: totals.completedStudents + row.completedStudents,
      }),
      {
        totalLessons: 0,
        enrolledStudents: 0,
        activeStudents: 0,
        completedStudents: 0,
      }
    );

    individualRows.push({
      courseId: CUSTOMIZED_COURSES_AGGREGATE_ID,
      courseTitle: "Customized Courses (combined)",
      courseCount: customizedRows.length,
      ...aggregate,
      completionRate: completionRate(
        aggregate.completedStudents,
        aggregate.enrolledStudents
      ),
      rowType: "customized_aggregate",
    });
  }

  return individualRows.sort((a, b) => {
    if (a.rowType !== b.rowType) {
      return a.rowType === "customized_aggregate" ? 1 : -1;
    }
    return a.courseTitle.localeCompare(b.courseTitle);
  });
}

export function hasWrittenFeedbackComment(
  comment: string | null | undefined
): boolean {
  return Boolean(comment?.trim());
}
