"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoRecordingForm as InnerForm } from "./VideoRecordingForm";
import type { PracticeExercise } from "@/db/schema";
import type { VideoRecordingDefinition, ExerciseDefinition } from "@/types/exercises";
import { toast } from "sonner";

interface VideoRecordingFormWrapperProps {
  exercise?: PracticeExercise;
  language: string;
  practiceSetId: string;
  onSave: (exercise: PracticeExercise) => void;
  onCancel: () => void;
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  onLocalSave?: (data: {
    type: string;
    language: string;
    definition: ExerciseDefinition;
  }) => void;
}

export function VideoRecordingForm({
  exercise,
  language,
  practiceSetId,
  onSave,
  onCancel,
  isSaving,
  setIsSaving,
  onLocalSave,
}: VideoRecordingFormWrapperProps) {
  const [definition, setDefinition] = useState<VideoRecordingDefinition>(
    (exercise?.definition as VideoRecordingDefinition) || {
      type: "video_recording",
      prompt: "",
      videoPromptId: undefined,
      videoThreadId: undefined,
      explanation: undefined,
    }
  );

  const handleSave = async () => {
    // Validate
    if (!definition.prompt && !definition.videoPromptId && !definition.videoThreadId) {
      toast.error("Please enter a prompt or select a video thread.");
      return;
    }

    // If local save (Builder mode)
    if (onLocalSave) {
      onLocalSave({
        type: "video_recording",
        language,
        definition,
      });
      return;
    }

    // Server save
    setIsSaving(true);
    try {
      const url = exercise
        ? `/api/admin/exercises/${exercise.id}`
        : "/api/admin/exercises";
      const method = exercise ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceSetId,
          type: "video_recording",
          language,
          definition,
          sortOrder: exercise?.sortOrder ?? 0,
        }),
      });

      if (!res.ok) throw new Error("Failed to save exercise");

      const { exercise: savedExercise } = await res.json();
      onSave(savedExercise);
      toast.success("Exercise saved!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save exercise");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <InnerForm definition={definition} onChange={setDefinition} />

      <div className="flex justify-end gap-3 pt-4 border-t border-zinc-700">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : exercise ? "Update Exercise" : "Create Exercise"}
        </Button>
      </div>
    </div>
  );
}
