"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { extractToneFromPinyin, getToneColorStyle } from "@/lib/tone-colors";
import type { CharAnnotation } from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// One stacked character column: pinyin on top, character below. Shared by the
// submission card, reviewer view, and feedback page so they render
// identically. The pinyin is a select-none sibling ABOVE the character, so it
// always sits on top of its character and moves with it (including inside
// struck-through corrections). The character span carries `data-offset` for
// the reviewer's highlight-to-select mechanic; its text content is just the
// character so offset math stays correct.
// ---------------------------------------------------------------------------

export function AnnotatedChar({
  ann,
  fontSize,
  struck = false,
  dataOffset,
}: {
  ann: CharAnnotation;
  fontSize: number;
  /** Render the character as a red strikethrough (corrected original text). */
  struck?: boolean;
  /** UTF-16 offset to expose for selection mapping; omit for read-only views. */
  dataOffset?: number;
}) {
  const pinyinSize = Math.round(fontSize * 0.42);
  const toneStyle = ann.pinyin
    ? getToneColorStyle(extractToneFromPinyin(ann.pinyin), "mandarin")
    : undefined;

  const charStyle: CSSProperties = struck
    ? { fontSize: `${fontSize}px`, color: "#ef4444" }
    : { fontSize: `${fontSize}px`, ...toneStyle };

  return (
    <span
      className="inline-flex flex-col items-center align-top"
      style={{ minWidth: "1.05em" }}
    >
      <span
        className="leading-tight text-blue-400 select-none whitespace-nowrap"
        style={{ fontSize: `${pinyinSize}px` }}
      >
        {ann.pinyin || " "}
      </span>
      <span
        data-offset={dataOffset}
        className={cn(
          "leading-tight",
          struck && "line-through decoration-red-500 decoration-2",
        )}
        style={charStyle}
      >
        {ann.char}
      </span>
    </span>
  );
}
