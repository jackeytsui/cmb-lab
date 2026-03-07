/**
 * Chinese text segmentation using Intl.Segmenter.
 *
 * Wraps the built-in Intl.Segmenter API for word-level Chinese text
 * segmentation. Creates a single reusable segmenter instance at module
 * level to avoid repeated construction.
 */

/** A single word-level segment from Chinese text. */
export interface WordSegment {
  /** The text content of this segment */
  text: string;
  /** Character offset of this segment in the original text */
  index: number;
  /** Whether this segment is a word-like token (true) or punctuation/whitespace (false) */
  isWordLike: boolean;
}

/** Module-level segmenter instance — created once, reused across calls. */
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

/**
 * Segment Chinese text into word-level tokens.
 *
 * Uses the built-in Intl.Segmenter with Chinese locale and word granularity.
 * Each segment includes the text, its character offset, and whether it
 * represents a word-like token (as opposed to punctuation or whitespace).
 *
 * @param text - The Chinese text to segment
 * @returns Array of word segments with text, index, and isWordLike flag
 *
 * @example
 * ```ts
 * segmentText('你好世界')
 * // => [{ text: '你好', index: 0, isWordLike: true },
 * //     { text: '世界', index: 2, isWordLike: true }]
 *
 * segmentText('你好，世界！')
 * // => [{ text: '你好', index: 0, isWordLike: true },
 * //     { text: '，', index: 2, isWordLike: false },
 * //     { text: '世界', index: 3, isWordLike: true },
 * //     { text: '！', index: 5, isWordLike: false }]
 * ```
 */
export function segmentText(text: string): WordSegment[] {
  if (!text || !text.trim()) {
    return [];
  }

  return Array.from(segmenter.segment(text)).map((seg) => ({
    text: seg.segment,
    index: seg.index,
    // Fallback for browser differences where isWordLike may be undefined
    isWordLike: seg.isWordLike ?? true,
  }));
}
