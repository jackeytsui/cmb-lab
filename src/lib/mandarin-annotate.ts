import { segmentText } from "@/lib/segmenter";
import { applyThirdToneSandhi } from "@/lib/tone-sandhi";
import { toSimplifiedSync } from "@/lib/chinese-convert";

// ---------------------------------------------------------------------------
// Per-character Mandarin annotation, shared by the assignment display
// components so the submission card, reviewer view, and feedback page all
// render pinyin/tone-coloring identically.
//
// Pinyin is derived exactly like the coaching/reader pages: word-segment the
// full sentence, convert each word to Simplified, then apply third-tone
// sandhi. Deriving per WORD (not per isolated character) keeps polyphonic
// readings correct. Offsets are UTF-16 string indices into the ORIGINAL text
// so they line up with reviewer correction ranges.
// ---------------------------------------------------------------------------

export interface CharAnnotation {
  /** The character (one code point; may be a surrogate pair). */
  char: string;
  /** UTF-16 start offset of this character in the original text. */
  offset: number;
  /** Pinyin syllable, or "" for punctuation/non-word characters. */
  pinyin: string;
}

/** Base character size (px) for assignment Mandarin displays. */
export const ASSIGNMENT_CHAR_SIZE = 26;
/** Compact character size (px) for tighter contexts. */
export const ASSIGNMENT_CHAR_SIZE_COMPACT = 20;
/** Pinyin size relative to the character size (~18px at the base size). */
export const PINYIN_RATIO = 0.69;
/** English translation size (px) shown beneath each sentence. */
export const ASSIGNMENT_ENGLISH_SIZE = 18;

export function annotateSentence(text: string): CharAnnotation[] {
  const segments = segmentText(text);
  const result: CharAnnotation[] = [];

  for (const seg of segments) {
    const chars = [...seg.text];
    const syllables = seg.isWordLike
      ? applyThirdToneSandhi(toSimplifiedSync(seg.text))
      : [];
    // seg.index is the UTF-16 offset of this segment in the original text.
    let intra = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      result.push({
        char: ch,
        offset: seg.index + intra,
        pinyin: seg.isWordLike ? (syllables[i] ?? "") : "",
      });
      intra += ch.length; // 1, or 2 for a surrogate pair
    }
  }

  return result;
}
