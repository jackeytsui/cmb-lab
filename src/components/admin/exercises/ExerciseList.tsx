"use client";

import { useState } from "react";
import {
  BookOpen,
  ListChecks,
  TextCursorInput,
  ArrowLeftRight,
  ListOrdered,
  Mic,
  PenLine,
  Pencil,
  Trash2,
  Loader2,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { PracticeExercise } from "@/db/schema";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Exercise Type Metadata
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
// Content Preview Helper
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

interface ExerciseListProps {
  exercises: PracticeExercise[];
  onEdit: (exercise: PracticeExercise) => void;
  onDelete: (exerciseId: string) => void;
  isDeleting?: string;
}

// ============================================================
// Component
// ============================================================

export default function ExerciseList({
  exercises,
  onEdit,
  onDelete,
  isDeleting,
}: ExerciseListProps) {
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);

  // Empty state
  if (exercises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 px-6 py-12">
        <BookOpen className="mb-3 h-10 w-10 text-zinc-500" />
        <p className="text-sm text-zinc-400">
          No exercises yet. Add your first exercise to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {exercises.map((exercise) => {
        const typeMeta = EXERCISE_TYPE_MAP[exercise.type] ?? {
          label: exercise.type,
          icon: ListChecks,
        };
        const langMeta = LANGUAGE_BADGE[exercise.language] ?? LANGUAGE_BADGE.both;
        const Icon = typeMeta.icon;
        const definition = exercise.definition as ExerciseDefinition;
        const isDeletingThis = isDeleting === exercise.id;

        return (
          <div
            key={exercise.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4"
          >
            {/* Left: info */}
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-700">
                <Icon className="h-4 w-4 text-zinc-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {typeMeta.label}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                      langMeta.className
                    )}
                  >
                    {langMeta.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-400">
                  {getContentPreview(definition)}
                </p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(exercise)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit</span>
              </Button>

              <AlertDialog
                open={deleteDialogId === exercise.id}
                onOpenChange={(open) =>
                  setDeleteDialogId(open ? exercise.id : null)
                }
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-400 hover:text-red-300"
                    disabled={isDeletingThis}
                  >
                    {isDeletingThis ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="sr-only">Delete</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-zinc-700 bg-zinc-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-zinc-100">
                      Delete exercise?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                      This will remove the {typeMeta.label.toLowerCase()}{" "}
                      exercise. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-zinc-600 bg-zinc-700 text-zinc-200 hover:bg-zinc-600">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        onDelete(exercise.id);
                        setDeleteDialogId(null);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ExerciseList };
