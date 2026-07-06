// ---------------------------------------------------------------------------
// Text assignment auto-scoring.
//
// Score = uncorrected Chinese characters / total Chinese characters * 100,
// rounded to the nearest whole number. Only Chinese characters count —
// punctuation, spaces, Latin letters, pinyin, and English are ignored.
// Correction offsets are exact JS string (UTF-16) indices into the sentence's
// chineseText, matching what DOM selection produces.
// ---------------------------------------------------------------------------

export interface CorrectionRange {
  startOffset: number;
  endOffset: number;
}

export interface ScorableSentence {
  chineseText: string;
  corrections: CorrectionRange[];
}

function isChineseCodePoint(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // Extension B
    (code >= 0x2a700 && code <= 0x2ebef) || // Extensions C–F
    (code >= 0xf900 && code <= 0xfaff) || // Compatibility Ideographs
    (code >= 0x2f800 && code <= 0x2fa1f) // Compatibility Supplement
  );
}

/** True if the (first code point of the) given character is a Chinese ideograph. */
export function isChineseCharacter(char: string): boolean {
  const code = char.codePointAt(0);
  return code !== undefined && isChineseCodePoint(code);
}

/** Count Chinese ideographs in a string (punctuation/Latin/spaces excluded). */
export function countChineseCharacters(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isChineseCharacter(char)) count++;
  }
  return count;
}

/**
 * Validate a correction range against the sentence it belongs to.
 * A valid range is within bounds, non-empty, and covers at least one
 * Chinese character isn't required — but bounds must be sane.
 */
export function isValidCorrectionRange(
  range: CorrectionRange,
  textLength: number,
): boolean {
  return (
    Number.isInteger(range.startOffset) &&
    Number.isInteger(range.endOffset) &&
    range.startOffset >= 0 &&
    range.endOffset > range.startOffset &&
    range.endOffset <= textLength
  );
}

/** True if any two ranges overlap (touching boundaries are allowed). */
export function hasOverlappingRanges(ranges: CorrectionRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startOffset < sorted[i - 1].endOffset) return true;
  }
  return false;
}

/** Merge ranges (defensively handling overlaps) clamped to the text bounds. */
function mergeRanges(
  ranges: CorrectionRange[],
  textLength: number,
): Array<[number, number]> {
  const clamped = ranges
    .map((r): [number, number] => [
      Math.max(0, Math.min(r.startOffset, textLength)),
      Math.max(0, Math.min(r.endOffset, textLength)),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of clamped) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Count Chinese characters inside the corrected ranges of a sentence. */
export function countCorrectedChineseCharacters(
  text: string,
  corrections: CorrectionRange[],
): number {
  let count = 0;
  for (const [start, end] of mergeRanges(corrections, text.length)) {
    let i = start;
    while (i < end) {
      const code = text.codePointAt(i);
      if (code === undefined) break;
      if (isChineseCodePoint(code)) count++;
      i += code > 0xffff ? 2 : 1;
    }
  }
  return count;
}

/**
 * Auto score for a whole text assignment submission (one overall percentage).
 * Returns null when the submission contains no Chinese characters at all.
 */
export function calculateTextAssignmentScore(
  sentences: ScorableSentence[],
): number | null {
  let total = 0;
  let corrected = 0;
  for (const sentence of sentences) {
    total += countChineseCharacters(sentence.chineseText);
    corrected += countCorrectedChineseCharacters(
      sentence.chineseText,
      sentence.corrections,
    );
  }
  if (total === 0) return null;
  return Math.round(((total - corrected) / total) * 100);
}
