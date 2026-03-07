"use client";

import { useState } from "react";
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
  MatchingDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Zod Form Schema
// ============================================================

const matchingFormSchema = z.object({
  pairs: z
    .array(
      z.object({
        id: z.string(),
        left: z.string().min(1, "Left side required"),
        right: z.string().min(1, "Right side required"),
      })
    )
    .min(2, "At least 2 pairs required")
    .max(10, "Maximum 10 pairs"),
  explanation: z.string().optional(),
});

// Explicit form data type for react-hook-form compatibility with Zod v4
type MatchingFormData = {
  pairs: { id: string; left: string; right: string }[];
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

export interface MatchingPairsFormProps {
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

export function MatchingPairsForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: MatchingPairsFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const isEditMode = !!exercise;
  const existingDef = exercise?.definition as MatchingDefinition | undefined;

  const defaultPairs =
    existingDef?.pairs?.map((p) => ({ id: p.id, left: p.left, right: p.right })) ?? [
      { id: nanoid(), left: "", right: "" },
      { id: nanoid(), left: "", right: "" },
    ];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
     
  } = useForm<MatchingFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(matchingFormSchema) as any,
    defaultValues: {
      pairs: defaultPairs,
      explanation: existingDef?.explanation ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "pairs",
  });

  const onSubmit = async (data: MatchingFormData) => {
    const definition: MatchingDefinition = {
      type: "matching",
      pairs: data.pairs.map((p) => ({
        id: p.id,
        left: p.left,
        right: p.right,
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
      const url = isEditMode
        ? `/api/admin/exercises/${exercise.id}`
        : "/api/admin/exercises";
      const method = isEditMode ? "PUT" : "POST";

      const payload = {
        ...(isEditMode ? {} : { practiceSetId, language }),
        type: "matching",
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
        <h3 className="text-lg font-semibold text-white">Matching Pairs</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Students will drag items from the left column to match with the right
          column.
        </p>
      </div>

      {apiError && <ErrorAlert message={apiError} />}

      {/* Pairs List */}
      <div className="space-y-3">
        <Label className="text-zinc-300">
          Pairs <span className="text-red-400">*</span>
        </Label>

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex flex-1 gap-2">
              <div className="flex-1 space-y-1">
                {index === 0 && (
                  <span className="text-xs text-zinc-500">
                    Left (e.g., Chinese)
                  </span>
                )}
                <Input
                  {...register(`pairs.${index}.left`)}
                  placeholder="Left side"
                  className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                />
                {errors.pairs?.[index]?.left && (
                  <p className="text-xs text-red-400">
                    {errors.pairs[index].left?.message}
                  </p>
                )}
              </div>
              <div className="flex-1 space-y-1">
                {index === 0 && (
                  <span className="text-xs text-zinc-500">
                    Right (e.g., English)
                  </span>
                )}
                <Input
                  {...register(`pairs.${index}.right`)}
                  placeholder="Right side"
                  className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                />
                {errors.pairs?.[index]?.right && (
                  <p className="text-xs text-red-400">
                    {errors.pairs[index].right?.message}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              disabled={fields.length <= 2}
              className="mt-0 text-zinc-400 hover:bg-zinc-700 hover:text-red-400 disabled:opacity-30"
            >
              Remove
            </Button>
          </div>
        ))}

        {errors.pairs?.root && (
          <p className="text-sm text-red-400">{errors.pairs.root.message}</p>
        )}
        {errors.pairs?.message && (
          <p className="text-sm text-red-400">{errors.pairs.message}</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ id: nanoid(), left: "", right: "" })}
          disabled={fields.length >= 10}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          + Add Pair
        </Button>
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="explanation" className="text-zinc-300">
          Explanation (optional)
        </Label>
        <Textarea
          id="explanation"
          {...register("explanation")}
          placeholder="Shown after the student completes the exercise"
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
