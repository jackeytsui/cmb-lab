import { describe, expect, it } from "vitest";
import {
  CUSTOMIZED_COURSES_AGGREGATE_ID,
  SYSTEM_PROGRESS_BATCH_MINIMUM,
  aggregateCompletionRows,
  hasWrittenFeedbackComment,
  isCustomizedAnalyticsCourse,
  isLikelyStudentActivityBatch,
  type CompletionRowInput,
} from "@/lib/admin-analytics-model";

function row(
  overrides: Partial<CompletionRowInput> &
    Pick<CompletionRowInput, "courseId" | "courseTitle">
): CompletionRowInput {
  return {
    totalLessons: 10,
    enrolledStudents: 10,
    activeStudents: 5,
    completedStudents: 2,
    isCustomized: false,
    ...overrides,
  };
}

describe("admin analytics presentation model", () => {
  it("recognizes both generations of customized-course titles", () => {
    expect(
      isCustomizedAnalyticsCourse("Customized CM School - Nursing Chinese")
    ).toBe(true);
    expect(isCustomizedAnalyticsCourse("Mandarin for Nursing Chinese")).toBe(
      true
    );
    expect(isCustomizedAnalyticsCourse("Chinese for Playing Badminton")).toBe(
      true
    );
    expect(
      isCustomizedAnalyticsCourse("The Canto to Mando Blueprint - Foundations")
    ).toBe(false);
  });

  it("combines customized courses into one weighted row", () => {
    const result = aggregateCompletionRows([
      row({
        courseId: "foundations",
        courseTitle: "Foundations",
        enrolledStudents: 20,
        completedStudents: 10,
      }),
      row({
        courseId: "custom-a",
        courseTitle: "Customized A",
        enrolledStudents: 2,
        activeStudents: 1,
        completedStudents: 1,
        totalLessons: 5,
        isCustomized: true,
      }),
      row({
        courseId: "custom-b",
        courseTitle: "Customized B",
        enrolledStudents: 8,
        activeStudents: 3,
        completedStudents: 1,
        totalLessons: 7,
        isCustomized: true,
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      courseId: "foundations",
      completionRate: 50,
      rowType: "course",
    });
    expect(result[1]).toEqual({
      courseId: CUSTOMIZED_COURSES_AGGREGATE_ID,
      courseTitle: "Customized Courses (combined)",
      courseCount: 2,
      totalLessons: 12,
      enrolledStudents: 10,
      activeStudents: 4,
      completedStudents: 2,
      completionRate: 20,
      rowType: "customized_aggregate",
    });
  });

  it("treats blank feedback as no written comment", () => {
    expect(hasWrittenFeedbackComment(null)).toBe(false);
    expect(hasWrittenFeedbackComment("   ")).toBe(false);
    expect(hasWrittenFeedbackComment("Helpful session")).toBe(true);
  });

  it("does not count bulk progress imports as student engagement", () => {
    expect(isLikelyStudentActivityBatch(1)).toBe(true);
    expect(
      isLikelyStudentActivityBatch(SYSTEM_PROGRESS_BATCH_MINIMUM - 1)
    ).toBe(true);
    expect(isLikelyStudentActivityBatch(SYSTEM_PROGRESS_BATCH_MINIMUM)).toBe(
      false
    );
    expect(isLikelyStudentActivityBatch(150)).toBe(false);
  });
});
