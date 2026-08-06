import { describe, expect, it } from "vitest";
import {
  courseLibraryReturnHref,
  matchesVideoAskDestination,
  videoAskDestinationFocusFromSearchParams,
  videoAskMigrationHref,
} from "../vocal-hack-routing";

describe("VideoAsk Course Library routing", () => {
  it("builds a destination-aware migration URL", () => {
    expect(
      videoAskMigrationHref({
        courseId: "course-1",
        moduleId: "module-2",
        lessonId: "lesson-3",
      }),
    ).toBe(
      "/admin/integrations/videoask?courseId=course-1&moduleId=module-2&lessonId=lesson-3",
    );
  });

  it("normalizes Next search params and ignores an empty focus", () => {
    expect(
      videoAskDestinationFocusFromSearchParams({
        courseId: ["course-1", "ignored"],
        moduleId: " module-2 ",
      }),
    ).toEqual({ courseId: "course-1", moduleId: "module-2", lessonId: null });
    expect(videoAskDestinationFocusFromSearchParams({})).toBeNull();
  });

  it("uses the most specific selected destination", () => {
    const focus = {
      courseId: "course-1",
      moduleId: "module-2",
      lessonId: "lesson-3",
    };
    expect(
      matchesVideoAskDestination(
        {
          targetCourseId: "course-1",
          targetModuleId: "module-2",
          targetLessonId: "lesson-3",
        },
        focus,
      ),
    ).toBe(true);
    expect(
      matchesVideoAskDestination(
        {
          targetCourseId: "course-1",
          targetModuleId: "module-2",
          targetLessonId: "another-lesson",
        },
        focus,
      ),
    ).toBe(false);
  });

  it("returns to the originating Course Library lesson", () => {
    expect(
      courseLibraryReturnHref({
        courseId: "course-1",
        moduleId: "module-2",
        lessonId: "lesson-3",
      }),
    ).toBe("/admin/course-library/course-1/lessons/lesson-3");
  });
});
