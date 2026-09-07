import { describe, expect, it } from "vitest";
import {
  isPresetCourseLibraryCourseTitle,
  isPrivateCourseLibraryCourseTitle,
} from "@/lib/course-library-course-visibility";

describe("Course Library preset and private course visibility", () => {
  it.each([
    "The Canto to Mando Blueprint - Foundations",
    "The Canto to Mando Blueprint - Intermediate",
    "The Canto to Mando Blueprint - Advanced",
    "Confident Cantonese Kickstarter",
  ])("keeps the preset catalogue tag-managed: %s", (title) => {
    expect(isPresetCourseLibraryCourseTitle(title)).toBe(true);
    expect(isPrivateCourseLibraryCourseTitle(title)).toBe(false);
  });

  it.each([
    "Mandarin for Finance",
    "Mandarin for Children",
    "Chinese for Playing Badminton",
    "Cantonese for Dentistry",
    "Customized CM School - Nursing Chinese",
    "testing",
  ])("makes every non-preset course private: %s", (title) => {
    expect(isPresetCourseLibraryCourseTitle(title)).toBe(false);
    expect(isPrivateCourseLibraryCourseTitle(title)).toBe(true);
  });
});
