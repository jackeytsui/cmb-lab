import { BLUEPRINT_COURSE_TITLES } from "@/lib/ghl/course-progress-plan";

/**
 * Course Library titles that belong to the shared, tag-managed catalogue.
 *
 * Every other course is treated as private and requires a direct per-student
 * grant. Keeping this list explicit prevents a newly created custom course
 * from becoming visible to every student just because it was published.
 */
export const PRESET_COURSE_LIBRARY_TITLES = [
  ...Object.values(BLUEPRINT_COURSE_TITLES),
  "Confident Cantonese Kickstarter",
] as const;

const NORMALIZED_PRESET_TITLES = new Set(
  PRESET_COURSE_LIBRARY_TITLES.map(normalizeCourseTitle),
);

function normalizeCourseTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function isPresetCourseLibraryCourseTitle(title: string): boolean {
  return NORMALIZED_PRESET_TITLES.has(normalizeCourseTitle(title));
}

/** Private/custom courses are assigned only through explicit student access. */
export function isPrivateCourseLibraryCourseTitle(title: string): boolean {
  return !isPresetCourseLibraryCourseTitle(title);
}
