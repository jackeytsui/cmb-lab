"use client";

import { useMemo } from "react";
import { pinyin } from "pinyin-pro";
import {
  extractToneFromPinyin,
  extractToneFromJyutping,
  getToneColorClass,
} from "@/lib/tone-colors";

/**
 * Render Chinese text with per-character Pleco-style tone coloring.
 *
 * Uses pinyin-pro for Mandarin tone lookup and parses jyutping strings
 * for Cantonese tone lookup.
 */
export function ToneColoredText({
  text,
  lang = "mandarin",
  jyutping,
  pinyinStr,
  className,
}: {
  /** Chinese text to display */
  text: string;
  /** Which tone system to use for coloring */
  lang?: "mandarin" | "cantonese";
  /** Optional jyutping string (space-separated) for Cantonese tone extraction */
  jyutping?: string | null;
  /** Optional pinyin string (space-separated) for Mandarin tone extraction */
  pinyinStr?: string | null;
  /** Additional className for the wrapper span */
  className?: string;
}) {
  const coloredChars = useMemo(() => {
    const chars = [...text];

    if (lang === "cantonese" && jyutping) {
      // Parse jyutping syllables
      const syllables = jyutping.split(/\s+/).filter(Boolean);
      return chars.map((char, i) => {
        const jp = syllables[i];
        if (!jp) return { char, colorClass: "" };
        const tone = extractToneFromJyutping(jp);
        return { char, colorClass: getToneColorClass(tone, "cantonese") };
      });
    }

    // Mandarin: use provided pinyin string or look up via pinyin-pro
    if (pinyinStr) {
      const syllables = pinyinStr.split(/\s+/).filter(Boolean);
      return chars.map((char, i) => {
        const py = syllables[i];
        if (!py) return { char, colorClass: "" };
        const tone = extractToneFromPinyin(py);
        return { char, colorClass: getToneColorClass(tone, "mandarin") };
      });
    }

    // Fallback: use pinyin-pro to get tones
    const toneNumbers = pinyin(text, { pattern: "num", type: "array" }).map(Number);
    return chars.map((char, i) => {
      const tone = toneNumbers[i] ?? 0;
      return { char, colorClass: getToneColorClass(tone, "mandarin") };
    });
  }, [text, lang, jyutping, pinyinStr]);

  return (
    <span className={className}>
      {coloredChars.map((item, i) => (
        <span key={i} className={item.colorClass || undefined}>
          {item.char}
        </span>
      ))}
    </span>
  );
}
