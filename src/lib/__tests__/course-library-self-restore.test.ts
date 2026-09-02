import { describe, expect, it } from "vitest";
import {
  COMPLETE_COURSE_TARGET,
  planCourseLibrarySelfRestore,
} from "@/lib/course-library-self-restore";

const courses = [
  {
    id: "course-1",
    modules: [
      {
        lessonIds: ["lesson-1", "lesson-2"],
        completedLessonIds: ["lesson-1"],
      },
      {
        lessonIds: ["lesson-3", "lesson-4"],
        completedLessonIds: ["lesson-3"],
      },
    ],
  },
  {
    id: "course-2",
    modules: [
      {
        lessonIds: ["lesson-5", "lesson-6"],
        completedLessonIds: [],
      },
    ],
  },
];

describe("one-time Course Library progress restore planner", () => {
  it("completes only missing lessons before the selected next lesson", () => {
    expect(
      planCourseLibrarySelfRestore({
        courses,
        selections: [{ courseId: "course-1", target: "lesson-4" }],
      })
    ).toEqual({
      selections: [{ courseId: "course-1", target: "lesson-4" }],
      missingCompletionLessonIds: ["lesson-2"],
    });
  });

  it("can finish multiple entitled courses without reopening prior completion", () => {
    expect(
      planCourseLibrarySelfRestore({
        courses,
        selections: [
          { courseId: "course-1", target: COMPLETE_COURSE_TARGET },
          { courseId: "course-2", target: COMPLETE_COURSE_TARGET },
        ],
      }).missingCompletionLessonIds
    ).toEqual(["lesson-2", "lesson-4", "lesson-5", "lesson-6"]);
  });

  it("rejects duplicate, unavailable, and cross-course targets", () => {
    expect(() =>
      planCourseLibrarySelfRestore({
        courses,
        selections: [
          { courseId: "course-1", target: "lesson-2" },
          { courseId: "course-1", target: "lesson-3" },
        ],
      })
    ).toThrow("one restore point");

    expect(() =>
      planCourseLibrarySelfRestore({
        courses,
        selections: [{ courseId: "course-missing", target: "lesson-2" }],
      })
    ).toThrow("not available");

    expect(() =>
      planCourseLibrarySelfRestore({
        courses,
        selections: [{ courseId: "course-1", target: "lesson-5" }],
      })
    ).toThrow("does not belong");
  });
});
