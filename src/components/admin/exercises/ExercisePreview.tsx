"use client";

import { useMemo } from "react";
import { GripVertical, Mic } from "lucide-react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import { parseBlankSentence } from "@/lib/practice-utils";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface ExercisePreviewProps {
  definition: ExerciseDefinition;
  language?: "cantonese" | "mandarin" | "both";
}

// ============================================================
// Shuffle helper (deterministic per items length, no randomness on re-render)
// ============================================================

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================
// Sub-renderers per exercise type
// ============================================================

function MultipleChoicePreview({
  definition,
  language,
}: {
  definition: Extract<ExerciseDefinition, { type: "multiple_choice" }>;
  language?: "cantonese" | "mandarin" | "both";
}) {
  const forceLanguage =
    language === "cantonese"
      ? "cantonese"
      : language === "mandarin"
        ? "mandarin"
        : undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-200">
        <PhoneticText forceLanguage={forceLanguage}>
          {definition.question}
        </PhoneticText>
      </p>
      <div className="space-y-2">
        {definition.options.map((option) => (
          <div
            key={option.id}
            className="flex items-center gap-3 rounded-md bg-zinc-800 px-3 py-2"
          >
            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-500" />
            <span className="text-sm text-zinc-300">
              <PhoneticText forceLanguage={forceLanguage}>
                {option.text}
              </PhoneticText>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FillInBlankPreview({
  definition,
  language,
}: {
  definition: Extract<ExerciseDefinition, { type: "fill_in_blank" }>;
  language?: "cantonese" | "mandarin" | "both";
}) {
  const forceLanguage =
    language === "cantonese"
      ? "cantonese"
      : language === "mandarin"
        ? "mandarin"
        : undefined;

  const segments = useMemo(
    () => parseBlankSentence(definition.sentence),
    [definition.sentence]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Fill in the blanks:</p>
      <p className="text-sm leading-relaxed text-zinc-200">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <PhoneticText key={i} forceLanguage={forceLanguage}>
              {seg.value}
            </PhoneticText>
          ) : (
            <span
              key={i}
              className="mx-1 inline-block min-w-[60px] border-b-2 border-zinc-500 text-center text-zinc-500"
            >
              ___
            </span>
          )
        )}
      </p>
    </div>
  );
}

function MatchingPreview({
  definition,
}: {
  definition: Extract<ExerciseDefinition, { type: "matching" }>;
}) {
  const leftItems = useMemo(
    () => shuffleArray(definition.pairs, definition.pairs.length * 7),
    [definition.pairs]
  );
  const rightItems = useMemo(
    () => shuffleArray(definition.pairs, definition.pairs.length * 13),
    [definition.pairs]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Drag to match:</p>
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          {leftItems.map((pair) => (
            <div
              key={pair.id + "-left"}
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              {pair.left}
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {rightItems.map((pair) => (
            <div
              key={pair.id + "-right"}
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              {pair.right}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderingPreview({
  definition,
}: {
  definition: Extract<ExerciseDefinition, { type: "ordering" }>;
}) {
  const shuffledItems = useMemo(
    () => shuffleArray(definition.items, definition.items.length * 11),
    [definition.items]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Arrange in correct order:</p>
      <div className="space-y-2">
        {shuffledItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="text-sm text-zinc-200">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudioRecordingPreview({
  definition,
  language,
}: {
  definition: Extract<ExerciseDefinition, { type: "audio_recording" }>;
  language?: "cantonese" | "mandarin" | "both";
}) {
  const forceLanguage =
    language === "cantonese"
      ? "cantonese"
      : language === "mandarin"
        ? "mandarin"
        : undefined;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-lg font-medium text-zinc-100">
          <PhoneticText forceLanguage={forceLanguage}>
            {definition.targetPhrase}
          </PhoneticText>
        </p>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-full bg-zinc-700 px-6 py-3 text-sm font-medium text-zinc-400 opacity-60"
        >
          <Mic className="h-5 w-5" />
          Record
        </button>
      </div>
      {definition.referenceText && (
        <p className="text-center text-sm text-zinc-400">
          {definition.referenceText}
        </p>
      )}
    </div>
  );
}

function FreeTextPreview({
  definition,
  language,
}: {
  definition: Extract<ExerciseDefinition, { type: "free_text" }>;
  language?: "cantonese" | "mandarin" | "both";
}) {
  const forceLanguage =
    language === "cantonese"
      ? "cantonese"
      : language === "mandarin"
        ? "mandarin"
        : undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-200">
        <PhoneticText forceLanguage={forceLanguage}>
          {definition.prompt}
        </PhoneticText>
      </p>
      <textarea
        disabled
        placeholder="Type your answer here..."
        className="h-24 w-full resize-none rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-400 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {(definition.minLength || definition.maxLength) && (
        <p className="text-xs text-zinc-500">
          {definition.minLength && definition.maxLength
            ? `${definition.minLength}-${definition.maxLength} characters`
            : definition.minLength
              ? `Minimum ${definition.minLength} characters`
              : `Maximum ${definition.maxLength} characters`}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Main ExercisePreview Component
// ============================================================

export default function ExercisePreview({
  definition,
  language,
}: ExercisePreviewProps) {
  return (
    <div className="rounded-lg border border-zinc-600 bg-zinc-900 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Student View
      </p>
      {definition.type === "multiple_choice" && (
        <MultipleChoicePreview definition={definition} language={language} />
      )}
      {definition.type === "fill_in_blank" && (
        <FillInBlankPreview definition={definition} language={language} />
      )}
      {definition.type === "matching" && (
        <MatchingPreview definition={definition} />
      )}
      {definition.type === "ordering" && (
        <OrderingPreview definition={definition} />
      )}
      {definition.type === "audio_recording" && (
        <AudioRecordingPreview definition={definition} language={language} />
      )}
      {definition.type === "free_text" && (
        <FreeTextPreview definition={definition} language={language} />
      )}
    </div>
  );
}

export { ExercisePreview };
