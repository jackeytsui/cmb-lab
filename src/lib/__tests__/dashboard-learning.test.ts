import { describe, expect, it } from "vitest";
import {
  buildDashboardLearningCourses,
  type DashboardLearningRow,
} from "@/lib/dashboard-learning";

function row(
  overrides: Partial<DashboardLearningRow> = {},
): DashboardLearningRow {
  return {
    courseId: "course-a",
    courseTitle: "Course A",
    courseSummary: "Summary",
    courseSortOrder: 1,
    coverImageUrl: null,
    coverUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    moduleId: "module-a",
    moduleTitle: "Week 1",
    moduleSortOrder: 1,
    lessonId: "lesson-a",
    lessonTitle: "First lesson",
    lessonSortOrder: 1,
    progressId: null,
    completedAt: null,
    progressUpdatedAt: null,
    ...overrides,
  };
}

describe("dashboard learning queue", () => {
  it("puts the most recently active unfinished course first", () => {
    const courses = buildDashboardLearningCourses([
      row({
        courseId: "course-a",
        courseTitle: "Older course",
        progressId: "progress-a",
        progressUpdatedAt: new Date("2026-08-20T10:00:00.000Z"),
      }),
      row({
        courseId: "course-b",
        courseTitle: "Latest course",
        lessonId: "lesson-b",
        moduleId: "module-b",
        progressId: "progress-b",
        progressUpdatedAt: new Date("2026-08-27T10:00:00.000Z"),
      }),
      row({
        courseId: "course-c",
        courseTitle: "New course",
        lessonId: "lesson-c",
        moduleId: "module-c",
        courseSortOrder: 0,
      }),
    ]);

    expect(courses.map((course) => course.id)).toEqual([
      "course-b",
      "course-a",
      "course-c",
    ]);
  });

  it("resumes the first unfinished lesson in roadmap order", () => {
    const courses = buildDashboardLearningCourses([
      row({
        lessonId: "lesson-2",
        lessonTitle: "Second lesson",
        lessonSortOrder: 2,
      }),
      row({
        lessonId: "lesson-1",
        lessonTitle: "First lesson",
        lessonSortOrder: 1,
        progressId: "progress-1",
        completedAt: new Date("2026-08-20T10:00:00.000Z"),
        progressUpdatedAt: new Date("2026-08-20T10:00:00.000Z"),
      }),
    ]);

    expect(courses[0]).toMatchObject({
      completedLessons: 1,
      totalLessons: 2,
      percentComplete: 50,
      nextLessonId: "lesson-2",
      nextLessonTitle: "Second lesson",
      isStarted: true,
      isComplete: false,
    });
  });

  it("keeps completed courses after active and new courses", () => {
    const courses = buildDashboardLearningCourses([
      row({ courseId: "new", courseTitle: "New", lessonId: "new-lesson" }),
      row({
        courseId: "done",
        courseTitle: "Done",
        lessonId: "done-lesson",
        progressId: "done-progress",
        completedAt: new Date("2026-08-26T10:00:00.000Z"),
        progressUpdatedAt: new Date("2026-08-26T10:00:00.000Z"),
      }),
    ]);

    expect(courses.map((course) => course.id)).toEqual(["new", "done"]);
    expect(courses[1].isComplete).toBe(true);
  });
});

