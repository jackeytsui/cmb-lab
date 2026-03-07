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
  AudioRecordingDefinition,
  ExerciseDefinition,
} from "@/types/exercises";

// ============================================================
// Zod Form Schema
// ============================================================

const audioRecordingFormSchema = z.object({
  targetPhrase: z.string().min(1, "Target phrase is required"),
  referenceText: z.string().optional(),
  explanation: z.string().optional(),
});

// Explicit form data type for react-hook-form compatibility with Zod v4
type AudioFormData = {
  targetPhrase: string;
  referenceText?: string;
  explanation?: string;
};

// ============================================================
// Props
// ============================================================

export interface AudioRecordingFormProps {
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

export function AudioRecordingForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: AudioRecordingFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const isEditMode = !!exercise;
  const existingDef = exercise?.definition as
    | AudioRecordingDefinition
    | undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
     
  } = useForm<AudioFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver type mismatch with react-hook-form
    resolver: zodResolver(audioRecordingFormSchema) as any,
    defaultValues: {
      targetPhrase: existingDef?.targetPhrase ?? "",
      referenceText: existingDef?.referenceText ?? "",
      explanation: existingDef?.explanation ?? "",
    },
  });

  const onSubmit = async (data: AudioFormData) => {
    const definition: AudioRecordingDefinition = {
      type: "audio_recording",
      targetPhrase: data.targetPhrase,
      referenceText: data.referenceText || undefined,
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
        type: "audio_recording",
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
        <h3 className="text-lg font-semibold text-white">Audio Recording</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Students will record themselves reading this phrase. Pronunciation
          scoring will be added in a future update.
        </p>
      </div>

      {apiError && <ErrorAlert message={apiError} />}

      {/* Target Phrase */}
      <div className="space-y-2">
        <Label htmlFor="targetPhrase" className="text-zinc-300">
          Target Phrase <span className="text-red-400">*</span>
        </Label>
        <Input
          id="targetPhrase"
          {...register("targetPhrase")}
          placeholder="The phrase students should read aloud"
          className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
        {errors.targetPhrase && (
          <p className="text-sm text-red-400">
            {errors.targetPhrase.message}
          </p>
        )}
      </div>

      {/* Reference Text */}
      <div className="space-y-2">
        <Label htmlFor="referenceText" className="text-zinc-300">
          Reference / Translation (optional)
        </Label>
        <Textarea
          id="referenceText"
          {...register("referenceText")}
          placeholder="Optional English translation or context"
          rows={2}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="explanation" className="text-zinc-300">
          Explanation (shown after recording)
        </Label>
        <Textarea
          id="explanation"
          {...register("explanation")}
          placeholder="Optional feedback shown after the student records"
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
