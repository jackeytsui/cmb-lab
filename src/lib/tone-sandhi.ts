/**
 * Third-tone sandhi for Mandarin pinyin.
 *
 * pinyin-pro's built-in `toneSandhi` option only handles 一 and 不.
 * The third-tone 3+3 rule (consecutive third tones: first becomes second)
 * must be implemented manually.
 *
 * Algorithm: right-to-left pass through syllables. When a tone-3 syllable
 * precedes another tone-3 syllable, change the first to tone 2.
 *
 * Verified: pinyin('你好') returns 'nǐ hǎo' (no sandhi applied).
 * After applyThirdToneSandhi('你好'): ['ní', 'hǎo'] (sandhi applied).
 */

import { pinyin, convert } from "pinyin-pro";

/**
 * Apply Mandarin third-tone sandhi and return per-syllable pinyin with
 * tone mark diacritics.
 *
 * When two consecutive third tones occur, the first changes to second tone.
 * For 3+ consecutive third tones, apply right-to-left pairing:
 *   小老鼠 → xiǎo láo shǔ (second syllable changes, first stays 3)
 *   我也很好 → wó yě hén hǎo
 *
 * @param text - Chinese text to generate sandhi-adjusted pinyin for
 * @returns Array of tone-mark pinyin syllables
 *
 * @example
 * ```ts
 * applyThirdToneSandhi('你好')   // => ['ní', 'hǎo']
 * applyThirdToneSandhi('很好')   // => ['hén', 'hǎo']
 * applyThirdToneSandhi('小老鼠') // => ['xiǎo', 'láo', 'shǔ']
 * ```
 */
export function applyThirdToneSandhi(text: string): string[] {
  if (!text || !text.trim()) {
    return [];
  }

  // Get per-syllable numbered pinyin (e.g., ['ni3', 'hao3'])
  const syllables = pinyin(text, { toneType: "num", type: "array" });
  // Get just the tone numbers (e.g., [3, 3])
  const tones = pinyin(text, { pattern: "num", type: "array" }).map(Number);

  const modified = [...syllables];
  const modTones = [...tones];

  // Right-to-left pass: change tone 3 to 2 when followed by tone 3
  for (let i = modified.length - 2; i >= 0; i--) {
    if (modTones[i] === 3 && modTones[i + 1] === 3) {
      modified[i] = modified[i].replace(/3$/, "2");
      modTones[i] = 2;
    }
  }

  // Convert each numbered pinyin back to tone marks.
  // pinyin-pro's convert() handles tone 0 (neutral) correctly: 'de0' → 'de'.
  // Note: tone 5 is not used by pinyin-pro (it uses 0 for neutral tones).
  return modified.map((s) => convert(s));
}

/**
 * Convenience function: apply third-tone sandhi and return a single
 * space-joined pinyin string.
 *
 * @param text - Chinese text to generate sandhi-adjusted pinyin for
 * @returns Space-separated pinyin string with tone mark diacritics
 *
 * @example
 * ```ts
 * getPinyinWithSandhi('你好')   // => 'ní hǎo'
 * getPinyinWithSandhi('很好')   // => 'hén hǎo'
 * ```
 */
export function getPinyinWithSandhi(text: string): string {
  return applyThirdToneSandhi(text).join(" ");
}
