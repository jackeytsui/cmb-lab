/**
 * Sentence boundary detection for Chinese text.
 *
 * Splits an array of WordSegment tokens into sentence-level groups
 * based on Chinese and Western sentence-terminating punctuation.
 *
 * Used by ReaderTextArea to group words into sentences for
 * per-sentence TTS read-aloud and translation controls.
 */

import type { WordSegment } from "@/lib/segmenter";

/** A sentence range mapping segments to a sentence boundary. */
export interface SentenceRange {
  /** Start index in the segments array */
  startIndex: number;
  /** End index (inclusive) in the segments array */
  endIndex: number;
  /** Combined text of all segments in this sentence */
  text: string;
}

/**
 * Regex for sentence-terminating punctuation.
 * Includes Chinese full-width and Western half-width terminators.
 */
const SENTENCE_TERMINATORS = /[。！？；!?;]/;

/** Maximum character length for a single sentence (TTS limit). */
const MAX_SENTENCE_LENGTH = 200;

/**
 * Check if a segment is a sentence boundary.
 * Handles newlines as paragraph breaks and avoids splitting on
 * decimal points (e.g. "9.4" should not split).
 */
function isSentenceBoundary(
  seg: WordSegment,
  prevSeg: WordSegment | undefined,
  nextSeg: WordSegment | undefined,
): boolean {
  const text = seg.text;

  // Newlines are always paragraph/sentence boundaries
  if (text.includes("\n")) return true;

  // Check standard terminators
  if (SENTENCE_TERMINATORS.test(text)) return true;

  // ASCII period: only if NOT between digits (avoid splitting 9.4, 18.37 etc.)
  if (text === ".") {
    const prevIsDigit = prevSeg && /\d$/.test(prevSeg.text);
    const nextIsDigit = nextSeg && /^\d/.test(nextSeg.text);
    if (prevIsDigit && nextIsDigit) return false;
    return true;
  }

  return false;
}

/**
 * Build a SentenceRange from a slice of segments.
 * Returns null if the resulting text is pure whitespace.
 */
function buildSentence(
  segments: WordSegment[],
  startIndex: number,
  endIndex: number,
): SentenceRange | null {
  const text = segments
    .slice(startIndex, endIndex + 1)
    .map((s) => s.text)
    .join("");

  // Strip whitespace-only and clean up leading/trailing newlines
  const trimmed = text.trim();
  if (!trimmed) return null;

  return { startIndex, endIndex, text: trimmed };
}

/**
 * Split an oversized sentence at the nearest segment boundary
 * so each chunk stays within MAX_SENTENCE_LENGTH characters.
 */
function splitOversizedSentence(
  segments: WordSegment[],
  startIndex: number,
  endIndex: number,
): SentenceRange[] {
  const results: SentenceRange[] = [];
  let chunkStart = startIndex;
  let charCount = 0;
  let lastBreakableIndex = chunkStart;

  for (let i = startIndex; i <= endIndex; i++) {
    const segText = segments[i].text;
    charCount += segText.length;

    // Track breakable positions: non-word segments (punctuation, whitespace)
    // Also break at Chinese comma，
    if (!segments[i].isWordLike || /[，,、：:]/.test(segText)) {
      lastBreakableIndex = i;
    }

    if (charCount >= MAX_SENTENCE_LENGTH && i < endIndex) {
      const splitAt =
        lastBreakableIndex > chunkStart ? lastBreakableIndex : i;

      const sentence = buildSentence(segments, chunkStart, splitAt);
      if (sentence) results.push(sentence);

      chunkStart = splitAt + 1;
      charCount = 0;
      lastBreakableIndex = chunkStart;
    }
  }

  // Remaining chunk
  if (chunkStart <= endIndex) {
    const sentence = buildSentence(segments, chunkStart, endIndex);
    if (sentence) results.push(sentence);
  }

  return results;
}

/**
 * Detect sentence boundaries in an array of word segments.
 *
 * Walks through segments and splits at sentence-terminating punctuation
 * (Chinese: 。！？； Western: !?;) and newlines.
 *
 * Avoids splitting on decimal points (e.g. 9.4万亿).
 *
 * Sentences longer than 200 characters are further split at the nearest
 * comma or non-word segment boundary to respect TTS limits.
 */
export function detectSentences(segments: WordSegment[]): SentenceRange[] {
  if (segments.length === 0) return [];

  const results: SentenceRange[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevSeg = i > 0 ? segments[i - 1] : undefined;
    const nextSeg = i < segments.length - 1 ? segments[i + 1] : undefined;

    if (isSentenceBoundary(seg, prevSeg, nextSeg)) {
      const text = segments
        .slice(sentenceStart, i + 1)
        .map((s) => s.text)
        .join("");

      const trimmed = text.trim();
      if (trimmed) {
        if (trimmed.length > MAX_SENTENCE_LENGTH) {
          results.push(
            ...splitOversizedSentence(segments, sentenceStart, i),
          );
        } else {
          results.push({
            startIndex: sentenceStart,
            endIndex: i,
            text: trimmed,
          });
        }
      }

      sentenceStart = i + 1;
    }
  }

  // Handle trailing text without a terminator
  if (sentenceStart < segments.length) {
    const text = segments
      .slice(sentenceStart)
      .map((s) => s.text)
      .join("");

    const trimmed = text.trim();
    if (trimmed) {
      const endIndex = segments.length - 1;
      if (trimmed.length > MAX_SENTENCE_LENGTH) {
        results.push(
          ...splitOversizedSentence(segments, sentenceStart, endIndex),
        );
      } else {
        results.push({ startIndex: sentenceStart, endIndex, text: trimmed });
      }
    }
  }

  return results;
}
