import { segmentText } from "@/lib/segmenter";
import { applyThirdToneSandhi } from "@/lib/tone-sandhi";
import { toSimplifiedSync } from "@/lib/chinese-convert";

// ---------------------------------------------------------------------------
// Per-character Mandarin annotation, shared by the assignment display
// components so the submission card, reviewer view, and feedback page all
// render pinyin/tone-coloring identically to the 1:1 coaching page.
//
// Pinyin accuracy depends almost entirely on WORD segmentation, because
// pinyin-pro disambiguates polyphonic characters (多音字) from word context.
// The coaching page segments with jieba (server-side, via /api/segment) and
// then derives pinyin per word with applyThirdToneSandhi(toSimplifiedSync()).
// We reproduce that exactly: `annotateFromWords` takes jieba word tokens and
// produces per-character annotations. `annotateSentence` is a synchronous
// fallback using Intl.Segmenter for the first paint before the jieba result
// arrives (see useSentenceAnnotations).
//
// Offsets are UTF-16 string indices into the ORIGINAL text so they line up
// with reviewer correction ranges; /api/segment maps jieba boundaries back to
// the original characters, so concatenating word tokens reconstructs the text.
// ---------------------------------------------------------------------------

export interface CharAnnotation {
  /** The character (one code point; may be a surrogate pair). */
  char: string;
  /** UTF-16 start offset of this character in the original text. */
  offset: number;
  /** Pinyin syllable, or "" for punctuation/non-word characters. */
  pinyin: string;
}

export interface WordToken {
  text: string;
  isWordLike: boolean;
}

/** Base character size (px) for assignment Mandarin displays. */
export const ASSIGNMENT_CHAR_SIZE = 26;
/** Compact character size (px) for tighter contexts. */
export const ASSIGNMENT_CHAR_SIZE_COMPACT = 20;
/** Pinyin size relative to the character size (~18px at the base size). */
export const PINYIN_RATIO = 0.69;
/** English translation size (px) shown beneath each sentence. */
export const ASSIGNMENT_ENGLISH_SIZE = 18;

/**
 * Build per-character annotations from ordered word tokens. Word-like tokens
 * get per-character pinyin via the same pinyin-pro + third-tone-sandhi
 * pipeline the coaching page uses; punctuation/whitespace tokens get no
 * pinyin. Offsets accumulate over the tokens in order.
 */
export function annotateFromWords(words: WordToken[]): CharAnnotation[] {
  const result: CharAnnotation[] = [];
  let utf16 = 0;

  for (const word of words) {
    const chars = [...word.text];
    const syllables = word.isWordLike
      ? applyThirdToneSandhi(toSimplifiedSync(word.text))
      : [];
    let intra = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      result.push({
        char: ch,
        offset: utf16 + intra,
        pinyin: word.isWordLike ? (syllables[i] ?? "") : "",
      });
      intra += ch.length; // 1, or 2 for a surrogate pair
    }
    utf16 += word.text.length;
  }

  return result;
}

/**
 * Synchronous annotation using Intl.Segmenter. Used as the first-paint
 * fallback; the jieba-backed result (from useSentenceAnnotations) replaces it
 * for full coaching-grade accuracy.
 */
export function annotateSentence(text: string): CharAnnotation[] {
  return annotateFromWords(
    segmentText(text).map((seg) => ({
      text: seg.text,
      isWordLike: seg.isWordLike,
    })),
  );
}
