"use client";

import { ExerciseForm } from "@/components/admin/exercises/ExerciseForm";
import type { PracticeExercise } from "@/db/schema";
import type { BuilderExercise } from "@/hooks/useBuilderState";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface ExerciseBlockEditorProps {
  exercise: BuilderExercise;
  practiceSetId: string;
  onUpdate: (
    exerciseId: string,
    data: { type: string; language: string; definition: ExerciseDefinition }
  ) => void;
  onCancel: () => void;
}

// ============================================================
// Component
// ============================================================

export function ExerciseBlockEditor({
  exercise,
  practiceSetId,
  onUpdate,
  onCancel,
}: ExerciseBlockEditorProps) {
  // Convert BuilderExercise to PracticeExercise-like shape for ExerciseForm compatibility
  const exerciseAsPracticeExercise = {
    id: exercise.id,
    practiceSetId: exercise.practiceSetId || practiceSetId,
    type: exercise.type,
    language: exercise.language,
    definition: exercise.definition,
    sortOrder: exercise.sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as PracticeExercise;

  return (
    <div className="rounded-lg border-2 border-blue-500/50 bg-zinc-800 p-1">
      <ExerciseForm
        practiceSetId={practiceSetId}
        exercise={exerciseAsPracticeExercise}
        onSave={() => {
          /* no-op: local save handles it */
        }}
        onCancel={onCancel}
        onLocalSave={(data) => {
          onUpdate(exercise.id, data);
        }}
      />
    </div>
  );
}
