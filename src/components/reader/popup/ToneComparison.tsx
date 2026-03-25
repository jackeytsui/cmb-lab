"use client";

/**
 * ToneComparison — Side-by-side Mandarin/Cantonese tone display.
 *
 * For each character in the word, shows:
 *   - Mandarin pinyin syllable (left, amber)
 *   - The character (center)
 *   - Cantonese jyutping syllable (right, cyan)
 *
 * Highlights matching tone numbers with a subtle green underline.
 *
 * Uses dictionary-provided pinyin/jyutping when available (source of truth).
 * Falls back to pinyin-pro/to-jyutping using SIMPLIFIED characters to
 * ensure Mandarin pinyin never changes with traditional/simplified toggle.
 */

import { useMemo } from "react";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

export interface ToneComparisonProps {
  word: string;
  /** Simplified form of the word (stable source for pinyin derivation) */
  simplified?: string | null;
  /** Dictionary pinyin with tone marks, space-separated (e.g. "shuì jiào") */
  pinyinDisplay: string | null;
  /** Dictionary pinyin with tone numbers, space-separated (e.g. "shui4 jiao4") */
  pinyinNumbered?: string | null;
  /** Dictionary jyutping, space-separated (e.g. "seoi6 gaau3") */
  jyutping: string | null;
}

/** Extract the tone number from the end of a romanization syllable */
function extractToneNumber(syllable: string): string | null {
  const match = syllable.match(/(\d)$/);
  return match ? match[1] : null;
}

/** Split a syllable into base and tone number */
function splitSyllable(syllable: string): { base: string; tone: string | null } {
  const tone = extractToneNumber(syllable);
  if (tone) {
    return { base: syllable.slice(0, -1), tone };
  }
  return { base: syllable, tone: null };
}

export function ToneComparison({
  word,
  simplified,
  pinyinDisplay,
  pinyinNumbered,
  jyutping,
}: ToneComparisonProps) {
  const chars = useMemo(() => [...word], [word]);

  // Use simplified form for any runtime derivation (source of truth for Mandarin pinyin)
  const simplifiedWord = simplified ?? word;

  // Per-character pinyin (numbered) — prefer dictionary, fall back to runtime
  const pinyinSyllables = useMemo(() => {
    if (pinyinNumbered) {
      return pinyinNumbered.split(/\s+/);
    }
    // Fall back to runtime derivation from SIMPLIFIED form
    return pinyin(simplifiedWord, { type: "array", toneType: "num" }) as string[];
  }, [pinyinNumbered, simplifiedWord]);

  // Per-character pinyin (display with tone marks) — prefer dictionary, fall back to runtime
  const pinyinDisplaySyllables = useMemo(() => {
    if (pinyinDisplay) {
      return pinyinDisplay.split(/\s+/);
    }
    // Fall back to runtime derivation from SIMPLIFIED form
    return pinyin(simplifiedWord, { type: "array" }) as string[];
  }, [pinyinDisplay, simplifiedWord]);

  // Per-character jyutping — prefer dictionary, fall back to runtime
  const jyutpingSyllables = useMemo(() => {
    if (jyutping) {
      return jyutping.split(/\s+/);
    }
    // Fall back to runtime derivation (jyutping is the same for T/S)
    const list = ToJyutping.getJyutpingList(word);
    return list.map(([, jp]) => jp ?? "");
  }, [jyutping, word]);

  // Guard: don't render for empty/whitespace
  if (chars.length === 0 || !chars.some((c) => /\p{Script=Han}/u.test(c))) {
    return null;
  }

  return (
    <div className="px-3 py-2">
      <h4 className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
        Tone Comparison
      </h4>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1">
        {chars.map((char, i) => {
          // Skip non-Han characters (punctuation, whitespace)
          if (!/\p{Script=Han}/u.test(char)) {
            return null;
          }

          const pySyllable = pinyinSyllables[i] ?? "";
          const jpSyllable = jyutpingSyllables[i] ?? "";
          const pyDisplay = pinyinDisplaySyllables[i] ?? "";

          const pyParts = splitSyllable(pySyllable);
          const jpParts = splitSyllable(jpSyllable);

          const tonesMatch =
            pyParts.tone !== null &&
            jpParts.tone !== null &&
            pyParts.tone === jpParts.tone;

          return (
            <div key={i} className="contents">
              {/* Mandarin pinyin (left) */}
              <div
                className={`flex items-center justify-end gap-0.5 text-sm ${
                  tonesMatch
                    ? "underline decoration-emerald-500/60 underline-offset-2"
                    : ""
                }`}
              >
                <span className="text-amber-400">{pyDisplay}</span>
                {pyParts.tone && (
                  <sup className="text-[10px] text-amber-500/70">
                    {pyParts.tone}
                  </sup>
                )}
              </div>

              {/* Character (center) */}
              <div className="flex items-center justify-center text-lg font-medium text-foreground">
                {char}
              </div>

              {/* Cantonese jyutping (right) */}
              <div
                className={`flex items-center gap-0.5 text-sm ${
                  tonesMatch
                    ? "underline decoration-emerald-500/60 underline-offset-2"
                    : ""
                }`}
              >
                <span className="text-cyan-400">
                  {jpSyllable || "\u2014"}
                </span>
                {jpParts.tone && (
                  <sup className="text-[10px] text-cyan-500/70">
                    {jpParts.tone}
                  </sup>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
