"use client";

import {
  ListChecks,
  TextCursorInput,
  ArrowLeftRight,
  ListOrdered,
  Mic,
  PenLine,
  GripVertical,
  X,
  AlertTriangle,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuilderExercise } from "@/hooks/useBuilderState";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Exercise Type Metadata (duplicated from ExerciseList.tsx to avoid touching Phase 31)
// ============================================================

const EXERCISE_TYPE_MAP: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  multiple_choice: { label: "Multiple Choice", icon: ListChecks },
  fill_in_blank: { label: "Fill in Blank", icon: TextCursorInput },
  matching: { label: "Matching", icon: ArrowLeftRight },
  ordering: { label: "Ordering", icon: ListOrdered },
  audio_recording: { label: "Audio Recording", icon: Mic },
  free_text: { label: "Free Text", icon: PenLine },
  video_recording: { label: "Video Response", icon: Video },
};

const LANGUAGE_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  cantonese: {
    label: "Cantonese",
    className: "bg-teal-900/50 text-teal-300 border-teal-700",
  },
  mandarin: {
    label: "Mandarin",
    className: "bg-amber-900/50 text-amber-300 border-amber-700",
  },
  both: {
    label: "Both",
    className: "bg-zinc-700/50 text-zinc-300 border-zinc-600",
  },
};

// ============================================================
// Content Preview Helper (duplicated from ExerciseList.tsx)
// ============================================================

function getContentPreview(definition: ExerciseDefinition): string {
  switch (definition.type) {
    case "multiple_choice":
      return truncate(definition.question, 80);
    case "fill_in_blank":
      return truncate(definition.sentence, 80);
    case "matching":
      return `${definition.pairs.length} pairs`;
    case "ordering":
      return `${definition.items.length} items`;
    case "audio_recording":
      return truncate(definition.targetPhrase, 80);
    case "free_text":
      return truncate(definition.prompt, 80);
    case "video_recording":
      return truncate(definition.prompt, 80);
    default:
      return "";
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ============================================================
// Props
// ============================================================

interface ExerciseBlockProps {
  exercise: BuilderExercise;
  index: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

// ============================================================
// Component
// ============================================================

export function ExerciseBlock({
  exercise,
  index,
  onEdit,
  onRemove,
}: ExerciseBlockProps) {
  const typeMeta = EXERCISE_TYPE_MAP[exercise.type] ?? {
    label: exercise.type,
    icon: ListChecks,
  };
  const langMeta = LANGUAGE_BADGE[exercise.language] ?? LANGUAGE_BADGE.both;
  const Icon = typeMeta.icon;
  const preview = getContentPreview(exercise.definition);

  return (
    <div
      className="group flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-3 transition-colors hover:border-zinc-600"
      onClick={() => onEdit(exercise.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(exercise.id);
        }
      }}
    >
      {/* Drag handle */}
      <div className="flex shrink-0 cursor-grab items-center text-zinc-500 active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Type icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-700">
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">
            {index + 1}. {typeMeta.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
              langMeta.className
            )}
          >
            {langMeta.label}
          </span>
          {!exercise.isConfigured && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-700 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Needs editing
            </span>
          )}
        </div>
        {preview && (
          <p className="mt-1 truncate text-sm text-zinc-400">{preview}</p>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        className="flex shrink-0 items-center justify-center rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(exercise.id);
        }}
        aria-label="Remove exercise"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
