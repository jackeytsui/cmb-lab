"use client";

import { useMemo } from "react";
import { segmentText } from "@/lib/segmenter";
import { applyThirdToneSandhi } from "@/lib/tone-sandhi";
import { toSimplifiedSync } from "@/lib/chinese-convert";
import { extractToneFromPinyin, getToneColorStyle } from "@/lib/tone-colors";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Read-only Mandarin sentence display in the 1:1 coaching notes style:
// per-character pinyin stacked on top, tone-colored characters.
//
// Uses the same derivation as the coaching/reader pages (segmenter +
// pinyin-pro-via-sandhi + tone colors) but renders the pinyin smaller than
// the Chinese (standard ruby proportions) so the characters read as the
// primary text.
// ---------------------------------------------------------------------------

const PINYIN_RATIO = 0.5; // pinyin height relative to the Chinese character

function pinyinForWord(text: string): string[] {
  // Always derive pinyin from the Simplified form (source of truth), matching
  // WordSpan / smartRomanise.
  return applyThirdToneSandhi(toSimplifiedSync(text));
}

export function AnnotatedSentence({
  text,
  fontSize = 30,
  className,
}: {
  text: string;
  /** Chinese character size in px; pinyin is rendered at ~half this. */
  fontSize?: number;
  className?: string;
}) {
  const segments = useMemo(() => segmentText(text), [text]);
  const pinyinSize = Math.round(fontSize * PINYIN_RATIO);

  return (
    <span
      className={cn("inline-flex flex-wrap items-end gap-x-1 gap-y-1.5", className)}
      style={{ lineHeight: 1.15 }}
    >
      {segments.map((seg, si) => {
        // Non-word segments (punctuation, spaces) render inline without pinyin.
        if (!seg.isWordLike) {
          return (
            <span
              key={si}
              className="self-end whitespace-pre"
              style={{ fontSize: `${fontSize}px` }}
            >
              {seg.text}
            </span>
          );
        }

        const chars = [...seg.text];
        const pinyinArr = pinyinForWord(seg.text);

        return (
          <span key={si} className="inline-flex items-end">
            {chars.map((char, ci) => {
              const py = pinyinArr[ci] ?? "";
              const toneStyle = py
                ? getToneColorStyle(extractToneFromPinyin(py), "mandarin")
                : undefined;
              return (
                <span
                  key={ci}
                  className="inline-flex flex-col items-center"
                  style={{ minWidth: "1.05em" }}
                >
                  <span
                    className="leading-tight text-blue-400 select-none whitespace-nowrap"
                    style={{ fontSize: `${pinyinSize}px` }}
                  >
                    {py || " "}
                  </span>
                  <span
                    className="leading-tight"
                    style={{ fontSize: `${fontSize}px`, ...toneStyle }}
                  >
                    {char}
                  </span>
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
