import { describe, expect, it } from "vitest";
import {
  selectCurrentCourseProgress,
  type CourseLibraryProgressRow,
} from "@/lib/course-library-progress-summary";

function row(
  overrides: Partial<CourseLibraryProgressRow> = {},
): CourseLibraryProgressRow {
  return {
    courseId: "course-1",
    courseTitle: "CMB Foundation",
    courseSortOrder: 1,
    moduleTitle: "Module 1",
    moduleSortOrder: 1,
    lessonId: "lesson-1",
    lessonTitle: "Lesson 1",
    lessonSortOrder: 1,
    progressId: null,
    completedAt: null,
    progressUpdatedAt: null,
    ...overrides,
  };
}

describe("selectCurrentCourseProgress", () => {
  it("ignores courses without CMB Lab activity", () => {
    expect(selectCurrentCourseProgress([row()])).toBeNull();
  });

  it("calculates completion and the next lesson from lesson records", () => {
    const completedAt = new Date("2026-08-20T12:00:00Z");
    const progress = selectCurrentCourseProgress([
      row({
        progressId: "progress-1",
        completedAt,
        progressUpdatedAt: completedAt,
      }),
      row({
        lessonId: "lesson-2",
        lessonTitle: "Lesson 2",
        lessonSortOrder: 2,
      }),
      row({
        lessonId: "lesson-3",
        lessonTitle: "Lesson 3",
        lessonSortOrder: 3,
      }),
    ]);

    expect(progress).toEqual({
      courseId: "course-1",
      courseTitle: "CMB Foundation",
      completedLessons: 1,
      totalLessons: 3,
      percentComplete: 33,
      isComplete: false,
      nextLessonTitle: "Lesson 2",
      nextModuleTitle: "Module 1",
    });
  });

  it("uses the most recently active course as current", () => {
    const progress = selectCurrentCourseProgress([
      row({
        progressId: "foundation-progress",
        progressUpdatedAt: new Date("2026-08-18T12:00:00Z"),
      }),
      row({
        courseId: "course-2",
        courseTitle: "CMB Intermediate",
        courseSortOrder: 2,
        lessonId: "intermediate-lesson",
        progressId: "intermediate-progress",
        completedAt: new Date("2026-08-20T12:00:00Z"),
        progressUpdatedAt: new Date("2026-08-20T12:00:00Z"),
      }),
    ]);

    expect(progress?.courseTitle).toBe("CMB Intermediate");
    expect(progress?.isComplete).toBe(true);
  });
});
