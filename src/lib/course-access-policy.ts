export interface LessonAccessPolicyInput {
  accessTier: "preview" | "full" | null;
  hasCourseLevelAccess: boolean;
  hasModuleGrant: boolean;
  hasLessonGrant: boolean;
  lessonIndex: number;
  previewLessonCount: number;
}

/** Pure grant decision shared by course pages and assignment resolution. */
export function canAccessLessonByPolicy({
  accessTier,
  hasCourseLevelAccess,
  hasModuleGrant,
  hasLessonGrant,
  lessonIndex,
  previewLessonCount,
}: LessonAccessPolicyInput): boolean {
  if (hasLessonGrant || hasModuleGrant) return true;
  if (!hasCourseLevelAccess) return false;
  if (accessTier === "full") return true;
  return (
    accessTier === "preview" &&
    lessonIndex >= 0 &&
    lessonIndex < Math.max(0, previewLessonCount)
  );
}
