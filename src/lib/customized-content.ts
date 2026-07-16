// src/lib/customized-content.ts
// Customized (per-student) content detection.
//
// Series/courses whose title contains "customized" (e.g. "Customized CM
// School - Nursing Chinese") are built for specific students. They are
// hidden from ALL students by default — the team grants access manually
// (per-student pickers in the audio course editor / course library editor).
// They are also excluded from the Tag Management access lists, which only
// manage the regular catalogue.

/** True when a title marks the content as customized/per-student. */
export function isCustomizedTitle(title: string | null | undefined): boolean {
  return /customized/i.test(title ?? "");
}
