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
  OrderingDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Zod Form Schema
// ============================================================

// NOTE: correctPosition is NOT a form field. It is auto-assigned
// on submit based on the item's array index (the order the coach
// enters items IS the correct order).

const orderingFormSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1, "Item text required"),
      })
    )
    .min(2, "At least 2 items required")
    .max(10, "Maximum 10 items"),
  explanation: z.string().optional(),
});

// Explicit form data type for react-hook-form compatibility with Zod v4
type OrderingFormData = {
  items: { id: string; text: string }[];
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

export interface OrderingFormProps {
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

export function OrderingForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: OrderingFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const isEditMode = !!exercise;
  const existingDef = exercise?.definition as OrderingDefinition | undefined;

  // When editing, strip correctPosition (it's auto-computed on submit)
  const defaultItems =
    existingDef?.items?.map((item) => ({ id: item.id, text: item.text })) ?? [
      { id: nanoid(), text: "" },
      { id: nanoid(), text: "" },
    ];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
     
  } = useForm<OrderingFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(orderingFormSchema) as any,
    defaultValues: {
      items: defaultItems,
      explanation: existingDef?.explanation ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const onSubmit = async (data: OrderingFormData) => {
    // Auto-assign correctPosition based on array order
    const definition: OrderingDefinition = {
      type: "ordering",
      items: data.items.map((item, index) => ({
        id: item.id,
        text: item.text,
        correctPosition: index,
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
        type: "ordering",
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
        <h3 className="text-lg font-semibold text-white">Ordering Items</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Enter items in the correct order. Students will see them shuffled and
          must arrange them correctly.
        </p>
      </div>

      {apiError && <ErrorAlert message={apiError} />}

      {/* Items List */}
      <div className="space-y-3">
        <Label className="text-zinc-300">
          Items <span className="text-red-400">*</span>
        </Label>

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <span className="w-8 text-right text-sm font-medium text-zinc-400">
              {index + 1}.
            </span>
            <div className="flex-1 space-y-1">
              <Input
                {...register(`items.${index}.text`)}
                placeholder={`Item ${index + 1}`}
                className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
              />
              {errors.items?.[index]?.text && (
                <p className="text-xs text-red-400">
                  {errors.items[index].text?.message}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              disabled={fields.length <= 2}
              className="text-zinc-400 hover:bg-zinc-700 hover:text-red-400 disabled:opacity-30"
            >
              Remove
            </Button>
          </div>
        ))}

        {errors.items?.root && (
          <p className="text-sm text-red-400">{errors.items.root.message}</p>
        )}
        {errors.items?.message && (
          <p className="text-sm text-red-400">{errors.items.message}</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ id: nanoid(), text: "" })}
          disabled={fields.length >= 10}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          + Add Item
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
