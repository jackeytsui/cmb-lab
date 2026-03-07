"use client";

import { useState } from "react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { MultipleChoiceDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface MultipleChoiceRendererProps {
  definition: MultipleChoiceDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { selectedOptionId: string }) => void;
  disabled?: boolean;
  savedAnswer?: { selectedOptionId: string };
}

// ============================================================
// MultipleChoiceRenderer
// ============================================================

export function MultipleChoiceRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
  savedAnswer,
}: MultipleChoiceRendererProps) {
  const [selected, setSelected] = useState<string | null>(
    savedAnswer?.selectedOptionId ?? null
  );

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  function handleOptionClick(optionId: string) {
    if (disabled) return;
    setSelected(optionId);
  }

  function handleSubmit() {
    if (!selected || disabled) return;
    onSubmit({ selectedOptionId: selected });
  }

  return (
    <div className="space-y-4">
      {/* Question */}
      <p className="text-base font-medium text-zinc-200">
        <PhoneticText forceLanguage={forceLanguage}>
          {definition.question}
        </PhoneticText>
      </p>

      {/* Options */}
      <div className="space-y-2">
        {definition.options.map((option) => {
          const isSelected = selected === option.id;

          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => handleOptionClick(option.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                isSelected
                  ? "border-2 border-blue-500 bg-blue-600/30 text-white"
                  : "border-2 border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {/* Radio circle indicator */}
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-500"
                    : "border-zinc-500 bg-transparent"
                }`}
              >
                {isSelected && (
                  <div className="h-2 w-2 rounded-full bg-white" />
                )}
              </div>

              {/* Option text */}
              <span className="text-sm">
                <PhoneticText forceLanguage={forceLanguage}>
                  {option.text}
                </PhoneticText>
              </span>
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!selected || disabled}
          onClick={handleSubmit}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Answer
        </button>
      </div>
    </div>
  );
}
