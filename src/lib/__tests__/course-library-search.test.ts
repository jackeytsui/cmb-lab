import { describe, expect, it } from "vitest";
import { filterCourseLibraryCourses } from "@/lib/course-library-search";

const courses = [
  {
    id: "cantonese",
    title: "Confident Cantonese Kickstarter",
    summary: "Everyday speaking practice for beginners",
  },
  {
    id: "mandarin",
    title: "Mandarin for Children",
    summary: "Games and family-friendly vocabulary",
  },
  {
    id: "tones",
    title: "Tone Mastery",
    summary: null,
  },
];

describe("admin Course Library search", () => {
  it("returns every course for a blank search", () => {
    expect(filterCourseLibraryCourses(courses, "   ")).toEqual(courses);
  });

  it("matches titles without case sensitivity", () => {
    expect(filterCourseLibraryCourses(courses, "MANDARIN")).toEqual([
      courses[1],
    ]);
  });

  it("matches words from course descriptions", () => {
    expect(filterCourseLibraryCourses(courses, "family-friendly")).toEqual([
      courses[1],
    ]);
  });

  it("requires every search term while allowing title and description matches", () => {
    expect(filterCourseLibraryCourses(courses, "cantonese beginners")).toEqual([
      courses[0],
    ]);
    expect(filterCourseLibraryCourses(courses, "cantonese family")).toEqual([]);
  });

  it("normalizes full-width characters", () => {
    expect(filterCourseLibraryCourses(courses, "ＭＡＳＴＥＲＹ")).toEqual([
      courses[2],
    ]);
  });
});
