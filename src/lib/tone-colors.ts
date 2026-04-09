import type React from "react";

/**
 * Pleco-style tone coloring for Chinese characters.
 *
 * Mandarin: tone 1 red, tone 2 green, tone 3 blue, tone 4 purple, neutral grey.
 * Cantonese: 6-tone system with distinct colors per tone.
 *
 * Colors chosen to work in both light and dark mode (Tailwind 500-level).
 */

// Pleco standard tone colors (Mandarin — 4 tones + neutral)
// Uses !important override classes from globals.css to beat text-foreground inheritance
export const MANDARIN_TONE_COLORS: Record<number, string> = {
  1: "tone-color-red", // First tone (high level) -- red
  2: "tone-color-green", // Second tone (rising) -- green
  3: "tone-color-blue", // Third tone (dipping) -- blue
  4: "tone-color-purple", // Fourth tone (falling) -- purple
  0: "tone-color-muted", // Neutral tone -- grey
};

// Cantonese 6-tone colors
export const CANTONESE_TONE_COLORS: Record<number, string> = {
  1: "tone-color-red", // High level
  2: "tone-color-green", // High rising
  3: "tone-color-blue", // Mid level
  4: "tone-color-orange", // Low falling
  5: "tone-color-purple", // Low rising
  6: "tone-color-teal", // Low level
  0: "tone-color-muted", // Unknown
};

/**
 * Map of pinyin diacritics to their tone numbers.
 * Covers a, e, i, o, u, and u-umlaut variants.
 */
const DIACRITIC_TO_TONE: Record<string, number> = {
  // tone 1 (macron)
  "\u0101": 1, // a macron
  "\u0113": 1, // e macron
  "\u012B": 1, // i macron
  "\u014D": 1, // o macron
  "\u016B": 1, // u macron
  "\u01D6": 1, // u-umlaut macron
  // tone 2 (acute)
  "\u00E1": 2, // a acute
  "\u00E9": 2, // e acute
  "\u00ED": 2, // i acute
  "\u00F3": 2, // o acute
  "\u00FA": 2, // u acute
  "\u01D8": 2, // u-umlaut acute
  // tone 3 (caron)
  "\u01CE": 3, // a caron
  "\u011B": 3, // e caron
  "\u01D0": 3, // i caron
  "\u01D2": 3, // o caron
  "\u01D4": 3, // u caron
  "\u01DA": 3, // u-umlaut caron
  // tone 4 (grave)
  "\u00E0": 4, // a grave
  "\u00E8": 4, // e grave
  "\u00EC": 4, // i grave
  "\u00F2": 4, // o grave
  "\u00F9": 4, // u grave
  "\u01DC": 4, // u-umlaut grave
};

/**
 * Extract tone number from a pinyin syllable.
 * Supports both diacritic form ("ni3" -> 3, "ni" with diacritic -> tone) and
 * numbered form ("ni3" -> 3).
 *
 * @returns Tone number 0-4 (0 = neutral/unknown)
 */
export function extractToneFromPinyin(syllable: string): number {
  if (!syllable) return 0;

  // Check diacritics first
  for (const char of syllable) {
    const tone = DIACRITIC_TO_TONE[char];
    if (tone !== undefined) return tone;
  }

  // Check trailing number (e.g., "ni3")
  const lastChar = syllable[syllable.length - 1];
  if (lastChar >= "1" && lastChar <= "4") {
    return parseInt(lastChar, 10);
  }
  // pinyin-pro uses 0 for neutral, but some formats use 5
  if (lastChar === "5" || lastChar === "0") {
    return 0;
  }

  return 0;
}

/**
 * Extract tone number from a jyutping syllable.
 * Jyutping always uses trailing number (e.g., "nei5" -> 5).
 *
 * @returns Tone number 0-6 (0 = unknown)
 */
export function extractToneFromJyutping(syllable: string): number {
  if (!syllable) return 0;

  const lastChar = syllable[syllable.length - 1];
  if (lastChar >= "1" && lastChar <= "6") {
    return parseInt(lastChar, 10);
  }

  return 0;
}

/**
 * Get the Tailwind color class for a given tone number and language.
 */
export function getToneColorClass(
  tone: number,
  lang: "mandarin" | "cantonese",
): string {
  const colors =
    lang === "mandarin" ? MANDARIN_TONE_COLORS : CANTONESE_TONE_COLORS;
  return colors[tone] ?? colors[0];
}

// Inline style hex values (Tailwind 500-level equivalents)
const MANDARIN_TONE_HEX: Record<number, string> = {
  1: "#ef4444", // red-500
  2: "#22c55e", // green-500
  3: "#3b82f6", // blue-500
  4: "#a855f7", // purple-500
  0: "",        // neutral — inherit
};
const CANTONESE_TONE_HEX: Record<number, string> = {
  1: "#ef4444", // red-500
  2: "#22c55e", // green-500
  3: "#3b82f6", // blue-500
  4: "#f97316", // orange-500
  5: "#a855f7", // purple-500
  6: "#14b8a6", // teal-500
  0: "",        // neutral — inherit
};

/**
 * Get an inline color style for a given tone number and language.
 * Use this instead of getToneColorClass when CSS specificity may block Tailwind classes.
 */
export function getToneColorStyle(
  tone: number,
  lang: "mandarin" | "cantonese",
): React.CSSProperties | undefined {
  const hex = (lang === "mandarin" ? MANDARIN_TONE_HEX : CANTONESE_TONE_HEX)[tone];
  return hex ? { color: hex } : undefined;
}

/**
 * Get hex color for a tone.
 */
export function getToneColorHex(
  tone: number,
  lang: "mandarin" | "cantonese",
): string {
  return (lang === "mandarin" ? MANDARIN_TONE_HEX : CANTONESE_TONE_HEX)[tone] ?? "";
}

/** Short data-attribute code for CSS-based tone coloring via [data-tc] selectors */
const MANDARIN_TC: Record<number, string> = { 1: "r", 2: "g", 3: "b", 4: "p", 0: "m" };
const CANTONESE_TC: Record<number, string> = { 1: "r", 2: "g", 3: "b", 4: "o", 5: "p", 6: "t", 0: "m" };

export function getToneDataAttr(
  tone: number,
  lang: "mandarin" | "cantonese",
): string {
  return (lang === "mandarin" ? MANDARIN_TC : CANTONESE_TC)[tone] ?? "";
}
