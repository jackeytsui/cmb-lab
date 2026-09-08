/** Shared visual ratios. The selected size always describes Chinese text. */
export const ROMANIZATION_SIZE_RATIO = 0.68;
export const ENGLISH_SIZE_RATIO = 0.82;

export type ReaderTypographySizes = {
  romanizationSize: number;
  englishSize: number;
};

export function readerTypographySizes(chineseSize: number): ReaderTypographySizes {
  return {
    romanizationSize: Math.max(
      10,
      Math.round(chineseSize * ROMANIZATION_SIZE_RATIO),
    ),
    englishSize: Math.max(11, Math.round(chineseSize * ENGLISH_SIZE_RATIO)),
  };
}

/**
 * Coaching notes are commonly screen-shared. Keep the learning cues larger
 * than the characters so students can read and repeat them at a distance.
 */
export function coachingTypographySizes(
  chineseSize: number,
): ReaderTypographySizes {
  return {
    romanizationSize: Math.round(chineseSize * 1.2),
    englishSize: Math.round(chineseSize * 1.1),
  };
}
