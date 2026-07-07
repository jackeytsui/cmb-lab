// ---------------------------------------------------------------------------
// Pinyin comparison for the Listening Practice lesson type.
//
// Checking must disregard spacing and tones, so all of these count as a match
// for 你吃饭了吗 (model "nǐ chī fàn le ma"):
//   "Ni chi fan le ma", "nǐ chī fàn le ma", "Nichifanlema",
//   "Ni chifan lema", "nǐ chīfàn lema", "ni3 chi1 fan4 le ma"
//
// Rules (applied in order):
//   1. lowercase
//   2. ü / ǖǘǚǜ / the ASCII "u:" substitute → "v"  (kept DISTINCT from plain u,
//      because lü ≠ lu; "v" is the standard ASCII stand-in for ü)
//   3. strip tone diacritics (ā á ǎ à → a, etc.) via NFD
//   4. strip tone-number notation (ni3 → ni)
//   5. keep only a–z (removes spaces, apostrophes, punctuation, middle dots)
// ---------------------------------------------------------------------------

/** Canonicalise a pinyin string for tone/space-insensitive comparison. */
export function normalizePinyin(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // ü and its toned forms (and the "u:" ASCII form) all normalise to "v".
  s = s.replace(/ü/g, "v").replace(/[ǖǘǚǜ]/g, "v").replace(/u:/g, "v");
  // Decompose and strip combining tone marks from a/e/i/o/u/n/m.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Strip tone-number notation (0–5) and any stray digits.
  s = s.replace(/[0-9]/g, "");
  // Keep only the 26 latin letters — removes spaces, apostrophes, punctuation.
  s = s.replace(/[^a-z]/g, "");
  return s;
}

/**
 * True when a student's submission matches the model answer, ignoring spacing
 * and tones. Empty submissions never match.
 */
export function pinyinMatches(submission: string, modelAnswer: string): boolean {
  const a = normalizePinyin(submission);
  if (!a) return false;
  return a === normalizePinyin(modelAnswer);
}
