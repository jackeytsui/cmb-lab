/**
 * Some imports put the family name in BOTH firstName and lastName. Only remove
 * exact trailing copies of an explicit, single-token surname; do not guess a
 * surname from a display name or change ambiguous compound name boundaries.
 */
export function composeStudentName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const first = firstName?.trim().replace(/\s+/gu, " ") ?? "";
  const last = lastName?.trim().replace(/\s+/gu, " ") ?? "";
  const words = first ? first.split(" ") : [];
  const fold = (value: string) => value.normalize("NFC").toLowerCase();

  if (last && !last.includes(" ")) {
    // Preserve at least one given-name token (e.g. first Lee, last Lee).
    while (words.length > 1 && fold(words[words.length - 1]) === fold(last)) {
      words.pop();
    }
  }

  return [words.join(" "), last].filter(Boolean).join(" ") || null;
}
