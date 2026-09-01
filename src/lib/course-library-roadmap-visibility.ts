import {
  BLUEPRINT_COURSE_TITLES,
  type BlueprintLevel,
} from "@/lib/ghl/course-progress-plan";

const BLUEPRINT_LEVELS = [
  "Foundations",
  "Intermediate",
  "Advanced",
] as const satisfies readonly BlueprintLevel[];

type CourseSummary = {
  id: string;
  title: string;
};

export type CourseLibraryCardState = {
  locked: boolean;
  unlockRequirement: string | null;
};

function blueprintLevelForTitle(title: string): BlueprintLevel | null {
  return (
    BLUEPRINT_LEVELS.find(
      (level) => BLUEPRINT_COURSE_TITLES[level] === title,
    ) ?? null
  );
}

/**
 * Decide which course cards belong in the student library without changing
 * authorization. Denied non-roadmap courses remain private; only later
 * Blueprint levels can appear as locked previews for an enrolled student.
 */
export function getCourseLibraryCardStates(params: {
  courses: readonly CourseSummary[];
  canAccessCourse: (courseId: string) => boolean;
  showLockedBlueprintRoadmap: boolean;
}): Map<string, CourseLibraryCardState> {
  const states = new Map<string, CourseLibraryCardState>();

  for (const course of params.courses) {
    if (params.canAccessCourse(course.id)) {
      states.set(course.id, {
        locked: false,
        unlockRequirement: null,
      });
      continue;
    }

    if (!params.showLockedBlueprintRoadmap) continue;

    const level = blueprintLevelForTitle(course.title);
    if (!level) continue;

    const levelIndex = BLUEPRINT_LEVELS.indexOf(level);
    if (levelIndex <= 0) continue;

    const prerequisite = BLUEPRINT_LEVELS[levelIndex - 1];
    states.set(course.id, {
      locked: true,
      unlockRequirement: `Complete the ${prerequisite} course to unlock ${level}.`,
    });
  }

  return states;
}
