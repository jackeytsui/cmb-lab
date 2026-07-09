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

// ---------------------------------------------------------------------------
// Jyutping comparison for the Cantonese Listening Practice lesson type.
//
// Checking disregards spacing and tone NUMBERS (jyutping uses trailing 1–6),
// mirroring how the Mandarin check ignores tones. So for 你好 (model "nei5
// hou2") all of these match: "nei5 hou2", "nei hou", "neihou", "Nei Hou".
//   1. lowercase
//   2. strip ALL digits (jyutping tone numbers 1–6, plus any strays)
//   3. keep only a–z (removes spaces, punctuation, middle dots)
// ---------------------------------------------------------------------------

/** Canonicalise a jyutping string for tone/space-insensitive comparison. */
export function normalizeJyutping(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z]/g, "");
}

/** True when a student's jyutping submission matches the model answer. */
export function jyutpingMatches(
  submission: string,
  modelAnswer: string,
): boolean {
  const a = normalizeJyutping(submission);
  if (!a) return false;
  return a === normalizeJyutping(modelAnswer);
}

/** Language-aware romanisation match for the Listening Practice grader. */
export function romanisationMatches(
  submission: string,
  modelAnswer: string,
  language: "mandarin" | "cantonese",
): boolean {
  return language === "cantonese"
    ? jyutpingMatches(submission, modelAnswer)
    : pinyinMatches(submission, modelAnswer);
}
