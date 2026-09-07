import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseLessonNavigator } from "./CourseLessonNavigator";

const lessons = [
  {
    lessonId: "lesson-1",
    lessonTitle: "Warm-up",
    moduleId: "module-1",
    moduleTitle: "Getting Started",
    moduleShortTitle: null,
    weekLabel: "Week 1",
  },
  {
    lessonId: "lesson-2",
    lessonTitle: "Tone practice",
    moduleId: "module-1",
    moduleTitle: "Getting Started",
    moduleShortTitle: null,
    weekLabel: "Week 1",
  },
];

describe("CourseLessonNavigator", () => {
  it("shows module progress and marks the current lesson", () => {
    const html = renderToStaticMarkup(
      <CourseLessonNavigator
        courseId="course-1"
        currentLessonId="lesson-2"
        lessons={lessons}
        completedLessonIds={new Set(["lesson-1"])}
      />,
    );

    expect(html).toContain("Course roadmap");
    expect(html).toContain("1/2");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("/course-library/course-1/lessons/lesson-2");
  });
});
