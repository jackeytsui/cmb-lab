// ---------------------------------------------------------------------------
// Lesson language + base-type helpers for the Cantonese assignment duplicates.
//
// The four Cantonese lesson types (…_canto) share the exact content shape and
// submission/review flow of their Mandarin counterparts. The only differences
// are display + generation: romanisation is jyutping, English is translated
// from Cantonese (zh-HK), and TTS uses zh-HK — matching the 1:1 coaching
// "Cantonese input". Reviewer roles are shared, so a Canto submission maps back
// to the same base assignment_type_kind (text_assignment / vocal_hack / diary).
//
// Pure helpers with no server-only imports, so both client and server can use
// them.
// ---------------------------------------------------------------------------

export type AssignmentLanguage = "mandarin" | "cantonese";

/** Base assignment_type_kind values that carry a human-reviewed submission. */
export type ReviewableAssignmentKind = "text_assignment" | "vocal_hack" | "diary";

/** The four Cantonese course-library lesson types. */
export const CANTO_LESSON_TYPES = [
  "text_assignment_canto",
  "listening_practice_canto",
  "vocal_hack_canto",
  "diary_canto",
] as const;

/** True for any of the …_canto lesson types. */
export function isCantoneseLessonType(lessonType: string): boolean {
  return lessonType.endsWith("_canto");
}

/** The generation/display language implied by a lesson type. */
export function lessonLanguage(lessonType: string): AssignmentLanguage {
  return isCantoneseLessonType(lessonType) ? "cantonese" : "mandarin";
}

/** The base lesson type, stripping the "_canto" suffix (e.g. diary_canto → diary). */
export function baseLessonType(lessonType: string): string {
  return lessonType.endsWith("_canto")
    ? lessonType.slice(0, -"_canto".length)
    : lessonType;
}

/**
 * Map any assignment lesson type (Mandarin or Canto) to the base
 * assignment_type_kind used for the shared submission/review tables and reviewer
 * capabilities. Returns null for non-assignment lesson types.
 */
export function assignmentKindForLesson(
  lessonType: string,
): ReviewableAssignmentKind | null {
  switch (baseLessonType(lessonType)) {
    case "text_assignment":
      return "text_assignment";
    case "vocal_hack":
      return "vocal_hack";
    case "diary":
      return "diary";
    default:
      return null;
  }
}

/** True when a lesson type is one of the two text-assignment variants. */
export function isTextAssignmentLesson(lessonType: string): boolean {
  return baseLessonType(lessonType) === "text_assignment";
}

/** True when a lesson type is one of the two listening-practice variants. */
export function isListeningPracticeLesson(lessonType: string): boolean {
  return baseLessonType(lessonType) === "listening_practice";
}

/** True when a lesson type is one of the two vocal-hack variants. */
export function isVocalHackLesson(lessonType: string): boolean {
  return baseLessonType(lessonType) === "vocal_hack";
}

/** True when a lesson type is one of the two diary variants. */
export function isDiaryLesson(lessonType: string): boolean {
  return baseLessonType(lessonType) === "diary";
}

/** The translate-batch / TTS language code for a lesson's language. */
export function translationLanguageFor(
  language: AssignmentLanguage,
): "zh-CN" | "zh-HK" {
  return language === "cantonese" ? "zh-HK" : "zh-CN";
}
