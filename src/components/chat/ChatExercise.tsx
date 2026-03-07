"use client";

import { useState } from "react";
import { gradeMultipleChoice, gradeFillInBlank } from "@/lib/practice-grading";
import type { GradeResult } from "@/lib/practice-grading";
import type {
  MultipleChoiceDefinition,
  FillInBlankDefinition,
} from "@/types/exercises";

// ============================================================
// Types
// ============================================================

interface ExerciseDefinition {
  type: "multiple_choice" | "fill_in_blank";
  question: string;
  // MCQ fields
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  // Fill-in-blank fields
  sentence?: string;
  blanks?: {
    id: string;
    correctAnswer: string;
    acceptableAnswers?: string[];
  }[];
}

interface ChatExerciseProps {
  definition: ExerciseDefinition;
}

// ============================================================
// ChatExercise — Inline exercise renderer for chat
// ============================================================

export function ChatExercise({ definition }: ChatExerciseProps) {
  return (
    <div className="bg-zinc-700/50 rounded-xl p-3 my-1">
      {definition.type === "multiple_choice" ? (
        <MultipleChoiceExercise definition={definition} />
      ) : (
        <FillInBlankExercise definition={definition} />
      )}
    </div>
  );
}

// ============================================================
// Multiple Choice
// ============================================================

function MultipleChoiceExercise({
  definition,
}: {
  definition: ExerciseDefinition;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isGraded, setIsGraded] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);

  const handleSelect = (optionId: string) => {
    if (isGraded) return;
    setSelectedOptionId(optionId);

    // Build a MultipleChoiceDefinition for the grading function
    const mcDef: MultipleChoiceDefinition = {
      type: "multiple_choice",
      question: definition.question,
      options: definition.options ?? [],
      correctOptionId: definition.correctOptionId ?? "",
      explanation: definition.explanation,
    };

    const gradeResult = gradeMultipleChoice(optionId, mcDef);
    setResult(gradeResult);
    setIsGraded(true);
  };

  return (
    <div>
      <p className="text-[10px] text-cyan-400 uppercase tracking-wide mb-1">
        Quiz
      </p>
      <p className="text-sm font-medium text-zinc-100 mb-2">
        {definition.question}
      </p>
      <div className="flex flex-col gap-1.5">
        {(definition.options ?? []).map((option) => {
          let borderClass = "border-zinc-600";
          let bgClass = "bg-zinc-700/60 hover:bg-zinc-600/60";
          let icon: React.ReactNode = null;

          if (isGraded) {
            if (option.id === definition.correctOptionId) {
              borderClass = "border-emerald-500";
              bgClass = "bg-emerald-500/10";
              icon = (
                <span className="text-emerald-400 text-xs ml-auto">
                  &#10003;
                </span>
              );
            } else if (
              option.id === selectedOptionId &&
              option.id !== definition.correctOptionId
            ) {
              borderClass = "border-red-500";
              bgClass = "bg-red-500/10";
              icon = (
                <span className="text-red-400 text-xs ml-auto">&#10007;</span>
              );
            }
          }

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              disabled={isGraded}
              className={`flex items-center text-left text-sm px-3 py-2 rounded-lg border ${borderClass} ${bgClass} text-zinc-100 transition-colors disabled:cursor-default`}
            >
              <span>{option.text}</span>
              {icon}
            </button>
          );
        })}
      </div>
      {isGraded && result && (
        <div className="mt-2 space-y-1">
          <p
            className={`text-xs font-medium ${result.isCorrect ? "text-emerald-400" : "text-red-400"}`}
          >
            {result.feedback}
          </p>
          {result.explanation && (
            <p className="text-xs text-zinc-400">{result.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Fill in the Blank
// ============================================================

function FillInBlankExercise({
  definition,
}: {
  definition: ExerciseDefinition;
}) {
  const blanks = definition.blanks ?? [];
  const [blanksState, setBlanksState] = useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      for (const blank of blanks) {
        initial[blank.id] = "";
      }
      return initial;
    }
  );
  const [isGraded, setIsGraded] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [perBlankCorrect, setPerBlankCorrect] = useState<
    Record<string, boolean>
  >({});

  // Parse sentence into segments (text and blank placeholders)
  const sentence = definition.sentence ?? "";
  const segments = sentence.split("{{blank}}");

  const handleCheck = () => {
    if (isGraded) return;

    // Build answers array in blank order
    const answers = blanks.map((b) => blanksState[b.id] ?? "");

    // Build FillInBlankDefinition for grading
    const fibDef: FillInBlankDefinition = {
      type: "fill_in_blank",
      sentence: definition.sentence ?? "",
      blanks: blanks.map((b) => ({
        id: b.id,
        correctAnswer: b.correctAnswer,
        acceptableAnswers: b.acceptableAnswers,
      })),
      explanation: definition.explanation,
    };

    const gradeResult = gradeFillInBlank(answers, fibDef);

    // Determine per-blank correctness for visual feedback
    const perBlank: Record<string, boolean> = {};
    for (let i = 0; i < blanks.length; i++) {
      const blank = blanks[i];
      const studentAnswer = (answers[i] ?? "").trim().toLowerCase();
      const correct = blank.correctAnswer.trim().toLowerCase();
      const acceptable = blank.acceptableAnswers?.map((a) =>
        a.trim().toLowerCase()
      );
      perBlank[blank.id] =
        studentAnswer === correct ||
        (acceptable?.includes(studentAnswer) ?? false);
    }

    setPerBlankCorrect(perBlank);
    setResult(gradeResult);
    setIsGraded(true);
  };

  let blankIndex = 0;

  return (
    <div>
      <p className="text-[10px] text-cyan-400 uppercase tracking-wide mb-1">
        Fill in the blanks
      </p>
      <p className="text-sm font-medium text-zinc-100 mb-2">
        {definition.question}
      </p>
      <div className="text-sm text-zinc-200 leading-8 flex flex-wrap items-center gap-0.5">
        {segments.map((segment, i) => {
          const elements: React.ReactNode[] = [];

          // Text segment
          if (segment) {
            elements.push(
              <span key={`text-${i}`}>{segment}</span>
            );
          }

          // Blank input (except after the last segment)
          if (i < segments.length - 1 && blankIndex < blanks.length) {
            const blank = blanks[blankIndex];
            const currentBlankIndex = blankIndex;
            blankIndex++;

            const borderClass = isGraded
              ? perBlankCorrect[blank.id]
                ? "border-emerald-500"
                : "border-red-500"
              : "border-zinc-500";

            elements.push(
              <span key={`blank-${currentBlankIndex}`} className="inline-flex flex-col items-center">
                <input
                  type="text"
                  value={blanksState[blank.id] ?? ""}
                  onChange={(e) =>
                    setBlanksState((prev) => ({
                      ...prev,
                      [blank.id]: e.target.value,
                    }))
                  }
                  disabled={isGraded}
                  className={`w-24 bg-zinc-700 border-b-2 ${borderClass} text-center text-sm text-zinc-100 outline-none px-1 py-0.5 rounded-sm disabled:opacity-70`}
                  placeholder="..."
                />
                {isGraded && !perBlankCorrect[blank.id] && (
                  <span className="text-[10px] text-emerald-400 mt-0.5">
                    {blank.correctAnswer}
                  </span>
                )}
              </span>
            );
          }

          return elements;
        })}
      </div>
      {!isGraded && (
        <button
          onClick={handleCheck}
          className="mt-2 px-3 py-1 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
        >
          Check
        </button>
      )}
      {isGraded && result && (
        <div className="mt-2 space-y-1">
          <p
            className={`text-xs font-medium ${result.isCorrect ? "text-emerald-400" : "text-red-400"}`}
          >
            {result.feedback}
          </p>
          {result.explanation && (
            <p className="text-xs text-zinc-400">{result.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
