import { describe, expect, it } from "vitest";
import { BLUEPRINT_COURSE_TITLES } from "@/lib/ghl/course-progress-plan";
import {
  blueprintLevelForTitle,
  getCourseLibraryCardStates,
} from "@/lib/course-library-roadmap-visibility";

const courses = [
  { id: "foundations", title: BLUEPRINT_COURSE_TITLES.Foundations },
  { id: "intermediate", title: BLUEPRINT_COURSE_TITLES.Intermediate },
  { id: "advanced", title: BLUEPRINT_COURSE_TITLES.Advanced },
  { id: "private-custom", title: "Customized Student Course" },
];

describe("Course Library locked roadmap visibility", () => {
  it("recognizes only the three canonical Blueprint levels", () => {
    expect(blueprintLevelForTitle(BLUEPRINT_COURSE_TITLES.Foundations)).toBe(
      "Foundations",
    );
    expect(blueprintLevelForTitle(BLUEPRINT_COURSE_TITLES.Intermediate)).toBe(
      "Intermediate",
    );
    expect(blueprintLevelForTitle(BLUEPRINT_COURSE_TITLES.Advanced)).toBe(
      "Advanced",
    );
    expect(blueprintLevelForTitle("Customized Student Course")).toBeNull();
  });

  it("shows the full Blueprint path while keeping later levels locked", () => {
    const states = getCourseLibraryCardStates({
      courses,
      canAccessCourse: (courseId) => courseId === "foundations",
      showLockedBlueprintRoadmap: true,
    });

    expect([...states.entries()]).toEqual([
      ["foundations", { locked: false, unlockRequirement: null }],
      [
        "intermediate",
        {
          locked: true,
          unlockRequirement:
            "Complete the Foundations course to unlock Intermediate.",
        },
      ],
      [
        "advanced",
        {
          locked: true,
          unlockRequirement:
            "Complete the Intermediate course to unlock Advanced.",
        },
      ],
    ]);
  });

  it("unlocks the current level but still previews the next level", () => {
    const states = getCourseLibraryCardStates({
      courses,
      canAccessCourse: (courseId) =>
        courseId === "foundations" || courseId === "intermediate",
      showLockedBlueprintRoadmap: true,
    });

    expect(states.get("foundations")?.locked).toBe(false);
    expect(states.get("intermediate")?.locked).toBe(false);
    expect(states.get("advanced")).toEqual({
      locked: true,
      unlockRequirement: "Complete the Intermediate course to unlock Advanced.",
    });
  });

  it("never exposes denied courses when the student is not in the Blueprint roadmap", () => {
    const states = getCourseLibraryCardStates({
      courses,
      canAccessCourse: (courseId) => courseId === "private-custom",
      showLockedBlueprintRoadmap: false,
    });

    expect([...states.keys()]).toEqual(["private-custom"]);
  });

  it("never exposes denied custom courses as roadmap previews", () => {
    const states = getCourseLibraryCardStates({
      courses,
      canAccessCourse: (courseId) => courseId === "foundations",
      showLockedBlueprintRoadmap: true,
    });

    expect(states.has("private-custom")).toBe(false);
  });
});
