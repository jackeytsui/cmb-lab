"use client";

import { useState, useMemo } from "react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { FreeTextDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface FreeTextRendererProps {
  definition: FreeTextDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { text: string }) => void;
  disabled?: boolean;
  savedAnswer?: { text: string };
}

// ============================================================
// FreeTextRenderer
// ============================================================

export function FreeTextRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
  savedAnswer,
}: FreeTextRendererProps) {
  const [text, setText] = useState(savedAnswer?.text ?? "");

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  const trimmedLength = text.trim().length;

  const isBelowMin = !!definition.minLength && trimmedLength < definition.minLength;
  const isAboveMax = !!definition.maxLength && trimmedLength > definition.maxLength;
  const isEmpty = trimmedLength === 0;
  const canSubmit = !isEmpty && !isBelowMin && !isAboveMax && !disabled;

  // Character count color: green when valid, red when out of range
  const charCountColor = useMemo(() => {
    if (isEmpty) return "text-zinc-500";
    if (isBelowMin || isAboveMax) return "text-red-400";
    return "text-emerald-400";
  }, [isEmpty, isBelowMin, isAboveMax]);

  // Build character count label
  const charCountLabel = useMemo(() => {
    const count = trimmedLength;
    if (definition.minLength && definition.maxLength) {
      return `${count} / ${definition.minLength}-${definition.maxLength}`;
    }
    if (definition.maxLength) {
      return `${count} / ${definition.maxLength}`;
    }
    if (definition.minLength) {
      return `${count} (min ${definition.minLength})`;
    }
    return `${count} characters`;
  }, [trimmedLength, definition.minLength, definition.maxLength]);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ text: text.trim() });
  }

  return (
    <div className="space-y-4">
      {/* Prompt */}
      <p className="text-base font-medium text-zinc-200">
        <PhoneticText forceLanguage={forceLanguage}>
          {definition.prompt}
        </PhoneticText>
      </p>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Type your answer here..."
        disabled={disabled}
        className="w-full resize-y rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-white placeholder:text-zinc-500 transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />

      {/* Character count */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${charCountColor}`}>
          {charCountLabel}
        </p>

        {/* Submit button */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Answer
        </button>
      </div>
    </div>
  );
}
