"use client";

import ExercisePreview from "@/components/admin/exercises/ExercisePreview";
import type { BuilderExercise } from "@/hooks/useBuilderState";

// ============================================================
// Props
// ============================================================

interface BuilderPreviewPanelProps {
  exercises: BuilderExercise[];
}

// ============================================================
// Component
// ============================================================

export function BuilderPreviewPanel({ exercises }: BuilderPreviewPanelProps) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      {/* Header */}
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Student Preview
      </p>

      {/* Scrollable exercise list */}
      <div className="max-h-[calc(100vh-16rem)] space-y-4 overflow-y-auto pr-1">
        {exercises.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Add exercises from the palette to see a preview.
          </p>
        ) : (
          exercises.map((exercise, i) => (
            <div key={exercise.id}>
              {exercise.isConfigured ? (
                <div>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Question {i + 1}
                  </p>
                  <ExercisePreview
                    definition={exercise.definition}
                    language={exercise.language}
                  />
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-zinc-700 px-4 py-6 text-center">
                  <p className="text-sm text-zinc-500">
                    Question {i + 1} — Not yet configured
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
