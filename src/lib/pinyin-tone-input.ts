/** Vowel letter -> tone-mark variants for Mandarin tones 1-4. */
const TONE_MARKS: Record<string, readonly string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
  v: ["ǖ", "ǘ", "ǚ", "ǜ"],
  A: ["Ā", "Á", "Ǎ", "À"],
  E: ["Ē", "É", "Ě", "È"],
  I: ["Ī", "Í", "Ǐ", "Ì"],
  O: ["Ō", "Ó", "Ǒ", "Ò"],
  U: ["Ū", "Ú", "Ǔ", "Ù"],
  Ü: ["Ǖ", "Ǘ", "Ǚ", "Ǜ"],
  V: ["Ǖ", "Ǘ", "Ǚ", "Ǜ"],
};

const PINYIN_VOWELS = new Set("aeiouüvAEIOUÜV");

/** Apply a numbered Mandarin tone to one unmarked pinyin syllable. */
function applyToneToSyllable(syllable: string, tone: number): string {
  const chars = [...syllable];

  // Standard pinyin placement: a/e first, then o in "ou", then last vowel.
  for (let i = 0; i < chars.length; i++) {
    const lower = chars[i].toLowerCase();
    if (lower === "a" || lower === "e") {
      const variants = TONE_MARKS[chars[i]];
      if (variants) chars[i] = variants[tone - 1];
      return chars.join("");
    }
  }

  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].toLowerCase() === "o" && chars[i + 1].toLowerCase() === "u") {
      const variants = TONE_MARKS[chars[i]];
      if (variants) chars[i] = variants[tone - 1];
      return chars.join("");
    }
  }

  for (let i = chars.length - 1; i >= 0; i--) {
    if (PINYIN_VOWELS.has(chars[i])) {
      const variants = TONE_MARKS[chars[i]];
      if (variants) chars[i] = variants[tone - 1];
      return chars.join("");
    }
  }

  return syllable;
}

/**
 * Convert trailing tone-number input into display pinyin as the user types.
 * Examples: ni3 -> nǐ, hao3 -> hǎo, nv3/nü3 -> nǚ.
 * Cantonese Jyutping must not use this helper because its tone digits remain.
 */
export function applyPinyinToneNumbers(text: string): string {
  return text.replace(
    /([a-züA-ZÜ]+)([1-4])/g,
    (match, syllable: string, tone: string) => {
      if (![...syllable].some((char) => PINYIN_VOWELS.has(char))) {
        return match;
      }
      return applyToneToSyllable(syllable, Number(tone));
    },
  );
}

/** Keep the caret beside the syllable when a tone digit collapses to a mark. */
export function adjustedPinyinToneCursor(
  raw: string,
  converted: string,
  cursor: number,
): number {
  return Math.max(0, cursor - Math.max(0, raw.length - converted.length));
}
