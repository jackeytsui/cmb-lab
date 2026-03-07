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
 * Uses pinyin-pro and to-jyutping for per-character phonetics.
 */

import { useMemo } from "react";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

export interface ToneComparisonProps {
  word: string;
  pinyinDisplay: string | null;
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
  // pinyinDisplay and jyutping from the dictionary entry are not used for
  // per-character breakdown — we generate them dynamically per character
}: ToneComparisonProps) {
  const chars = useMemo(() => [...word], [word]);

  // Get per-character pinyin (numbered tones for comparison)
  const pinyinSyllables = useMemo(() => {
    return pinyin(word, { type: "array", toneType: "num" }) as string[];
  }, [word]);

  // Get per-character jyutping
  const jyutpingSyllables = useMemo(() => {
    const list = ToJyutping.getJyutpingList(word);
    return list.map(([, jp]) => jp ?? "");
  }, [word]);

  // Get per-character pinyin with tone marks (for display)
  const pinyinDisplaySyllables = useMemo(() => {
    return pinyin(word, { type: "array" }) as string[];
  }, [word]);

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
