"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { PracticeExercise } from "@/db/schema";
import type {
  FillInBlankDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Local Form Schema (no `type` discriminator for react-hook-form)
// ============================================================

const fillInBlankFormSchema = z.object({
  sentence: z.string().min(5, "Sentence must be at least 5 characters"),
  blanks: z
    .array(
      z.object({
        id: z.string(),
        correctAnswer: z.string().min(1, "Correct answer is required"),
        acceptableAnswers: z.string().optional(), // comma-separated in form
      })
    )
    .min(1, "Sentence must contain at least one {{blank}}"),
  explanation: z.string().optional(),
});

// Explicit form data type for Zod v4 compat
type FillInBlankFormData = {
  sentence: string;
  blanks: { id: string; correctAnswer: string; acceptableAnswers?: string }[];
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

interface FillInBlankFormProps {
  exercise?: PracticeExercise;
  language: string;
  practiceSetId: string;
  onSave: (exercise: PracticeExercise) => void;
  onCancel: () => void;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  onLocalSave?: (data: {
    type: string;
    language: string;
    definition: ExerciseDefinition;
  }) => void;
}

// ============================================================
// Helpers
// ============================================================

function countBlanks(sentence: string): number {
  const matches = sentence.match(/\{\{blank\}\}/g);
  return matches ? matches.length : 0;
}

// ============================================================
// Component
// ============================================================

export function FillInBlankForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: FillInBlankFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const isEditMode = !!exercise;

  // Extract existing definition if editing
  const existingDef = exercise?.definition as
    | FillInBlankDefinition
    | undefined;

  // Convert stored acceptableAnswers arrays to comma-separated strings for form
  const existingBlanks = existingDef?.blanks?.map((b) => ({
    id: b.id,
    correctAnswer: b.correctAnswer,
    acceptableAnswers: b.acceptableAnswers?.join(", ") ?? "",
  }));

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
     
  } = useForm<FillInBlankFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(fillInBlankFormSchema) as any,
    defaultValues: {
      sentence: existingDef?.sentence ?? "",
      blanks: existingBlanks ?? [],
      explanation: existingDef?.explanation ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "blanks",
  });

  const sentence = watch("sentence");

  // Auto-sync blanks array length when {{blank}} count changes in sentence
  const syncBlanks = useCallback(
    (blankCount: number) => {
      const currentLen = fields.length;
      if (blankCount > currentLen) {
        // Add blank fields
        for (let i = currentLen; i < blankCount; i++) {
          append({ id: nanoid(), correctAnswer: "", acceptableAnswers: "" });
        }
      } else if (blankCount < currentLen) {
        // Remove excess blank fields from the end
        for (let i = currentLen - 1; i >= blankCount; i--) {
          remove(i);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields.length]
  );

  useEffect(() => {
    const blankCount = countBlanks(sentence);
    syncBlanks(blankCount);
  }, [sentence, syncBlanks]);

  const onSubmit = async (data: FillInBlankFormData) => {
    const definition: FillInBlankDefinition = {
      type: "fill_in_blank",
      sentence: data.sentence,
      blanks: data.blanks.map((b) => ({
        id: b.id,
        correctAnswer: b.correctAnswer,
        acceptableAnswers: b.acceptableAnswers
          ? b.acceptableAnswers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      })),
      explanation: data.explanation || undefined,
    };

    // Local save path for builder (skip API)
    if (onLocalSave) {
      onLocalSave({ type: definition.type, language, definition });
      return;
    }

    setIsSaving(true);
    setApiError(null);

    try {
      const payload = {
        practiceSetId,
        type: "fill_in_blank",
        language,
        definition,
      };

      const url = isEditMode
        ? `/api/admin/exercises/${exercise.id}`
        : "/api/admin/exercises";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || result.error || "Failed to save exercise"
        );
      }

      onSave(result.exercise);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to save exercise"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* API Error */}
      {apiError && <ErrorAlert message={apiError} />}

      {/* Sentence Template */}
      <div className="space-y-2">
        <Label htmlFor="fib-sentence" className="text-zinc-300">
          Sentence Template <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="fib-sentence"
          {...register("sentence")}
          placeholder='Use {{blank}} where blanks should appear'
          rows={3}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
        <p className="text-xs text-zinc-500">
          Use {"{{blank}}"} to mark where students type their answers. Example:
          I {"{{blank}}"} to the store {"{{blank}}"}.
        </p>
        {errors.sentence && (
          <p className="text-sm text-red-400">{errors.sentence.message}</p>
        )}
      </div>

      {/* Blank Definitions */}
      {fields.length > 0 && (
        <div className="space-y-4">
          <Label className="text-zinc-300">Blank Definitions</Label>

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="space-y-2 rounded-md border border-zinc-700 bg-zinc-900 p-3"
            >
              <p className="text-sm font-medium text-zinc-400">
                Blank #{index + 1}
              </p>

              {/* Correct Answer */}
              <div className="space-y-1">
                <Label
                  htmlFor={`blank-correct-${index}`}
                  className="text-xs text-zinc-400"
                >
                  Correct Answer <span className="text-red-400">*</span>
                </Label>
                <Input
                  id={`blank-correct-${index}`}
                  {...register(`blanks.${index}.correctAnswer`)}
                  placeholder="Enter the correct answer"
                  className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                />
                {errors.blanks?.[index]?.correctAnswer && (
                  <p className="text-sm text-red-400">
                    {errors.blanks[index].correctAnswer?.message}
                  </p>
                )}
              </div>

              {/* Acceptable Answers */}
              <div className="space-y-1">
                <Label
                  htmlFor={`blank-acceptable-${index}`}
                  className="text-xs text-zinc-400"
                >
                  Also accept (comma-separated)
                </Label>
                <Input
                  id={`blank-acceptable-${index}`}
                  {...register(`blanks.${index}.acceptableAnswers`)}
                  placeholder="e.g. went, walked, drove"
                  className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
            </div>
          ))}

          {errors.blanks && typeof errors.blanks.message === "string" && (
            <p className="text-sm text-red-400">{errors.blanks.message}</p>
          )}
        </div>
      )}

      {/* No blanks message */}
      {fields.length === 0 && sentence.length > 0 && (
        <p className="text-sm text-amber-400">
          No {"{{blank}}"} placeholders found in the sentence. Add at least one
          to create blank fields.
        </p>
      )}

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="fib-explanation" className="text-zinc-300">
          Explanation (shown after answering)
        </Label>
        <Textarea
          id="fib-explanation"
          {...register("explanation")}
          placeholder="Optional explanation..."
          rows={2}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-zinc-700 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving
            ? "Saving..."
            : isEditMode
              ? "Update Exercise"
              : "Save Exercise"}
        </Button>
      </div>
    </form>
  );
}
