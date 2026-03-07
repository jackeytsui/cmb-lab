"use client";

import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciseBlock } from "./ExerciseBlock";
import type { BuilderExercise } from "@/hooks/useBuilderState";

// ============================================================
// SortableExerciseItem wrapper
// ============================================================

interface SortableItemProps {
  exercise: BuilderExercise;
  index: number;
  isEditing: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  renderEditor: (exercise: BuilderExercise) => React.ReactNode;
}

function SortableExerciseItem({
  exercise,
  index,
  isEditing,
  onEdit,
  onRemove,
  renderEditor,
}: SortableItemProps) {
  const { ref, isDragging } = useSortable({
    id: exercise.id,
    index,
    type: "exercise",
    group: "canvas",
  });

  return (
    <div
      ref={ref}
      data-dragging={isDragging}
      className={cn(
        "transition-all",
        isDragging && "scale-[0.98] opacity-50"
      )}
    >
      {isEditing ? (
        renderEditor(exercise)
      ) : (
        <ExerciseBlock
          exercise={exercise}
          index={index}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

// ============================================================
// BuilderCanvas
// ============================================================

interface BuilderCanvasProps {
  exercises: BuilderExercise[];
  editingId: string | null;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  renderEditor: (exercise: BuilderExercise) => React.ReactNode;
}

export function BuilderCanvas({
  exercises,
  editingId,
  onEdit,
  onRemove,
  renderEditor,
}: BuilderCanvasProps) {
  const { ref: canvasRef } = useDroppable({
    id: "canvas-drop-zone",
    type: "canvas",
  });

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">
          Questions{" "}
          <span className="font-normal text-zinc-500">({exercises.length})</span>
        </h3>
      </div>

      {/* Canvas drop zone */}
      <div
        ref={canvasRef}
        className="min-h-[300px] space-y-2"
      >
        {exercises.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/30 px-6 py-12">
            <PackagePlus className="mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-center text-sm text-zinc-500">
              Drag exercise types from the palette to add questions
            </p>
          </div>
        ) : (
          exercises.map((exercise, index) => (
            <SortableExerciseItem
              key={exercise.id}
              exercise={exercise}
              index={index}
              isEditing={editingId === exercise.id}
              onEdit={onEdit}
              onRemove={onRemove}
              renderEditor={renderEditor}
            />
          ))
        )}
      </div>
    </div>
  );
}
