"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { CircleDot, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";
import { cn } from "@/lib/utils";
import type { PracticeExercise } from "@/db/schema";
import type {
  MultipleChoiceDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Local Form Schema (no `type` discriminator for react-hook-form)
// ============================================================

const mcqFormSchema = z.object({
  question: z.string().min(5, "Question must be at least 5 characters"),
  options: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1, "Option text is required"),
      })
    )
    .min(2, "At least 2 options required")
    .max(6, "Maximum 6 options"),
  correctOptionId: z.string().min(1, "Select a correct answer"),
  explanation: z.string().optional(),
});

// Explicit form data type for Zod v4 compat
type MCQFormData = {
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

interface MultipleChoiceFormProps {
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
// Component
// ============================================================

export function MultipleChoiceForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: MultipleChoiceFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const isEditMode = !!exercise;

  // Extract existing definition if editing
  const existingDef = exercise?.definition as
    | MultipleChoiceDefinition
    | undefined;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
     
  } = useForm<MCQFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(mcqFormSchema) as any,
    defaultValues: {
      question: existingDef?.question ?? "",
      options: existingDef?.options ?? [
        { id: nanoid(), text: "" },
        { id: nanoid(), text: "" },
      ],
      correctOptionId: existingDef?.correctOptionId ?? "",
      explanation: existingDef?.explanation ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  const correctOptionId = watch("correctOptionId");

  const onSubmit = async (data: MCQFormData) => {
    const definition: MultipleChoiceDefinition = {
      type: "multiple_choice",
      question: data.question,
      options: data.options,
      correctOptionId: data.correctOptionId,
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
        type: "multiple_choice",
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

      {/* Question */}
      <div className="space-y-2">
        <Label htmlFor="mcq-question" className="text-zinc-300">
          Question <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="mcq-question"
          {...register("question")}
          placeholder="Enter the question text..."
          rows={3}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
        {errors.question && (
          <p className="text-sm text-red-400">{errors.question.message}</p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        <Label className="text-zinc-300">
          Options <span className="text-red-400">*</span>
        </Label>
        <p className="text-xs text-zinc-500">
          Add 2-6 options. Select the radio button for the correct answer.
        </p>

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            {/* Correct answer radio */}
            <button
              type="button"
              onClick={() => setValue("correctOptionId", field.id)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                correctOptionId === field.id
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : "border-zinc-600 text-zinc-500 hover:border-zinc-500"
              )}
              title={`Mark option ${index + 1} as correct`}
            >
              <CircleDot className="h-4 w-4" />
            </button>

            {/* Option text input */}
            <Input
              {...register(`options.${index}.text`)}
              placeholder={`Option ${index + 1}`}
              className="flex-1 border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
            />

            {/* Remove button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                // If removing the correct option, clear selection
                if (correctOptionId === field.id) {
                  setValue("correctOptionId", "");
                }
                remove(index);
              }}
              disabled={fields.length <= 2}
              className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 disabled:opacity-30"
              title="Remove option"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {/* Add option */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ id: nanoid(), text: "" })}
          disabled={fields.length >= 6}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Option
        </Button>

        {errors.options && (
          <p className="text-sm text-red-400">
            {typeof errors.options.message === "string"
              ? errors.options.message
              : "Please fill in all option texts."}
          </p>
        )}
        {errors.correctOptionId && (
          <p className="text-sm text-red-400">
            {errors.correctOptionId.message}
          </p>
        )}
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="mcq-explanation" className="text-zinc-300">
          Explanation (shown after answering)
        </Label>
        <Textarea
          id="mcq-explanation"
          {...register("explanation")}
          placeholder="Optional explanation for the correct answer..."
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
          {isSaving ? "Saving..." : isEditMode ? "Update Exercise" : "Save Exercise"}
        </Button>
      </div>
    </form>
  );
}
