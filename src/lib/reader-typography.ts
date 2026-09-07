/** Shared visual ratios. The selected size always describes Chinese text. */
export const ROMANIZATION_SIZE_RATIO = 0.68;
export const ENGLISH_SIZE_RATIO = 0.82;

export function readerTypographySizes(chineseSize: number) {
  return {
    romanizationSize: Math.max(
      10,
      Math.round(chineseSize * ROMANIZATION_SIZE_RATIO),
    ),
    englishSize: Math.max(11, Math.round(chineseSize * ENGLISH_SIZE_RATIO)),
  };
}
