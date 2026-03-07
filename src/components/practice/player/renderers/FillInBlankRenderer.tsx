"use client";

import { useState, useMemo, useCallback } from "react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import { parseBlankSentence } from "@/lib/practice-utils";
import type { FillInBlankDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface FillInBlankRendererProps {
  definition: FillInBlankDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { answers: string[] }) => void;
  disabled?: boolean;
  savedAnswer?: { answers: string[] };
}

// ============================================================
// FillInBlankRenderer
// ============================================================

export function FillInBlankRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
  savedAnswer,
}: FillInBlankRendererProps) {
  const [answers, setAnswers] = useState<string[]>(
    () => savedAnswer?.answers ?? new Array(definition.blanks.length).fill("")
  );

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  const segments = useMemo(
    () => parseBlankSentence(definition.sentence),
    [definition.sentence]
  );

  const allFilled = useMemo(
    () => answers.every((a) => a.trim() !== ""),
    [answers]
  );

  const handleAnswerChange = useCallback(
    (index: number, value: string) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    []
  );

  function handleSubmit() {
    if (!allFilled || disabled) return;
    onSubmit({ answers });
  }

  return (
    <div className="space-y-4">
      {/* Instruction */}
      <p className="text-sm text-zinc-400">Fill in the blanks:</p>

      {/* Sentence with inline inputs */}
      <p className="text-base leading-loose text-zinc-200">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <PhoneticText key={i} forceLanguage={forceLanguage}>
              {seg.value}
            </PhoneticText>
          ) : (
            <input
              key={i}
              type="text"
              placeholder="..."
              autoComplete="off"
              disabled={disabled}
              value={answers[seg.index]}
              onChange={(e) => handleAnswerChange(seg.index, e.target.value)}
              className="mx-1 inline-block min-w-[80px] max-w-[160px] border-b-2 border-zinc-500 bg-transparent text-center text-white transition focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          )
        )}
      </p>

      {/* Submit button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!allFilled || disabled}
          onClick={handleSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Answer
        </button>
      </div>
    </div>
  );
}
