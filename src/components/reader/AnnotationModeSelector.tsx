"use client";

/**
 * AnnotationModeSelector — Three-way toggle for annotation display mode.
 *
 * Options: Pinyin (拼音), Jyutping (粵拼), Plain (no annotation).
 * Uses styled buttons as a segmented control since shadcn ToggleGroup
 * is not installed. Active option has cyan-500 accent.
 */

import { cn } from "@/lib/utils";

export type AnnotationMode = "pinyin" | "jyutping" | "plain";

export interface AnnotationModeSelectorProps {
  mode: AnnotationMode;
  onChange: (mode: AnnotationMode) => void;
}

const OPTIONS: { value: AnnotationMode; label: string }[] = [
  { value: "pinyin", label: "拼音 Pinyin" },
  { value: "jyutping", label: "粵拼 Jyutping" },
  { value: "plain", label: "Plain" },
];

export function AnnotationModeSelector({
  mode,
  onChange,
}: AnnotationModeSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-md bg-muted p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
            mode === opt.value
              ? "bg-cyan-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground/90",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
