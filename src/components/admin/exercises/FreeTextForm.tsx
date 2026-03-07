"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { PracticeExercise } from "@/db/schema";
import type {
  FreeTextDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Zod Form Schema
// ============================================================

const freeTextFormSchema = z
  .object({
    prompt: z.string().min(5, "Prompt must be at least 5 characters"),
    sampleAnswer: z.string().optional(),
    rubric: z.string().optional(),
    minLength: z.coerce.number().int().min(1).optional().or(z.literal("")),
    maxLength: z.coerce.number().int().min(1).optional().or(z.literal("")),
    explanation: z.string().optional(),
  })
  .refine(
    (data) => {
      const min =
        typeof data.minLength === "number" ? data.minLength : undefined;
      const max =
        typeof data.maxLength === "number" ? data.maxLength : undefined;
      if (min !== undefined && max !== undefined) {
        return max >= min;
      }
      return true;
    },
    {
      message: "Max length must be greater than or equal to min length",
      path: ["maxLength"],
    }
  );

// Explicit form data type for react-hook-form compatibility with Zod v4
type FreeTextFormData = {
  prompt: string;
  sampleAnswer?: string;
  rubric?: string;
  minLength?: number | "";
  maxLength?: number | "";
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

export interface FreeTextFormProps {
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

export function FreeTextForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: FreeTextFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const isEditMode = !!exercise;
  const existingDef = exercise?.definition as FreeTextDefinition | undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
     
  } = useForm<FreeTextFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(freeTextFormSchema) as any,
    defaultValues: {
      prompt: existingDef?.prompt ?? "",
      sampleAnswer: existingDef?.sampleAnswer ?? "",
      rubric: existingDef?.rubric ?? "",
      minLength: existingDef?.minLength ?? "",
      maxLength: existingDef?.maxLength ?? "",
      explanation: existingDef?.explanation ?? "",
    },
  });

  const onSubmit = async (data: FreeTextFormData) => {
    const minLen =
      typeof data.minLength === "number" ? data.minLength : undefined;
    const maxLen =
      typeof data.maxLength === "number" ? data.maxLength : undefined;

    const definition: FreeTextDefinition = {
      type: "free_text",
      prompt: data.prompt,
      sampleAnswer: data.sampleAnswer || undefined,
      rubric: data.rubric || undefined,
      minLength: minLen,
      maxLength: maxLen,
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
      const url = isEditMode
        ? `/api/admin/exercises/${exercise.id}`
        : "/api/admin/exercises";
      const method = isEditMode ? "PUT" : "POST";

      const payload = {
        ...(isEditMode ? {} : { practiceSetId, language }),
        type: "free_text",
        definition,
      };

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
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 rounded-lg border border-zinc-700 bg-zinc-800 p-5"
    >
      <div>
        <h3 className="text-lg font-semibold text-white">Free Text</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Students will write a response to the prompt. AI grading uses the
          sample answer and rubric for evaluation.
        </p>
      </div>

      {apiError && <ErrorAlert message={apiError} />}

      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-zinc-300">
          Question Prompt <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="prompt"
          {...register("prompt")}
          placeholder="Write a sentence using..."
          rows={3}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
        {errors.prompt && (
          <p className="text-sm text-red-400">{errors.prompt.message}</p>
        )}
      </div>

      {/* Sample Answer */}
      <div className="space-y-2">
        <Label htmlFor="sampleAnswer" className="text-zinc-300">
          Sample Answer (optional)
        </Label>
        <Textarea
          id="sampleAnswer"
          {...register("sampleAnswer")}
          placeholder="An ideal student response (helps AI grading)"
          rows={2}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Rubric */}
      <div className="space-y-2">
        <Label htmlFor="rubric" className="text-zinc-300">
          Grading Rubric (optional)
        </Label>
        <Textarea
          id="rubric"
          {...register("rubric")}
          placeholder="Criteria for AI to evaluate responses"
          rows={2}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Min / Max Length */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="minLength" className="text-zinc-300">
            Min Length (optional)
          </Label>
          <Input
            id="minLength"
            type="number"
            {...register("minLength")}
            min={1}
            placeholder="e.g., 10"
            className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
          />
          {errors.minLength && (
            <p className="text-xs text-red-400">{errors.minLength.message}</p>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="maxLength" className="text-zinc-300">
            Max Length (optional)
          </Label>
          <Input
            id="maxLength"
            type="number"
            {...register("maxLength")}
            min={1}
            placeholder="e.g., 500"
            className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
          />
          {errors.maxLength && (
            <p className="text-xs text-red-400">{errors.maxLength.message}</p>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="explanation" className="text-zinc-300">
          Explanation (optional)
        </Label>
        <Textarea
          id="explanation"
          {...register("explanation")}
          placeholder="Shown after the student submits their response"
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
          {isSaving ? "Saving..." : isEditMode ? "Update" : "Create Exercise"}
        </Button>
      </div>
    </form>
  );
}
