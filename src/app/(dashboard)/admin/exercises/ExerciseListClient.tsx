"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus, Loader2, ChevronDown, ChevronRight, Blocks, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ExerciseList from "@/components/admin/exercises/ExerciseList";
import { cn } from "@/lib/utils";
import { AssignmentDialog } from "@/components/practice/assignments/AssignmentDialog";
import type { PracticeSet, PracticeExercise } from "@/db/schema";

// ============================================================
// Status Badge
// ============================================================

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-zinc-700/50 text-zinc-300 border-zinc-600",
  },
  published: {
    label: "Published",
    className: "bg-green-900/50 text-green-300 border-green-700",
  },
  archived: {
    label: "Archived",
    className: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  },
};

// ============================================================
// Props
// ============================================================

interface ExerciseListClientProps {
  practiceSets: PracticeSet[];
  exercises: PracticeExercise[];
}

// ============================================================
// Component
// ============================================================

export function ExerciseListClient({
  practiceSets,
  exercises,
}: ExerciseListClientProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(
    () => new Set(practiceSets.map((s) => s.id))
  );
  const [showNewSetForm, setShowNewSetForm] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningSetId, setAssigningSetId] = useState<string | null>(null);

  // Group exercises by practice set
  const exercisesBySet = new Map<string, PracticeExercise[]>();
  for (const set of practiceSets) {
    exercisesBySet.set(set.id, []);
  }
  for (const ex of exercises) {
    const existing = exercisesBySet.get(ex.practiceSetId);
    if (existing) {
      existing.push(ex);
    }
  }

  // Toggle expanded state for a set
  function toggleSet(setId: string) {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  }

  // Handle edit
  function handleEdit(exercise: PracticeExercise) {
    router.push(`/admin/exercises/${exercise.id}`);
  }

  // Handle delete
  async function handleDelete(exerciseId: string) {
    setDeletingId(exerciseId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exercises/${exerciseId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete exercise");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete exercise");
    } finally {
      setDeletingId(null);
    }
  }

  // Handle creating a new practice set
  async function handleCreateSet(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetTitle.trim()) return;

    setIsCreatingSet(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/practice-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSetTitle.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create practice set");
      }
      setNewSetTitle("");
      setShowNewSetForm(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create practice set"
      );
    } finally {
      setIsCreatingSet(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewSetForm(!showNewSetForm)}
          className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
        >
          <FolderPlus className="mr-2 h-4 w-4" />
          New Practice Set
        </Button>
      </div>

      {/* Inline new set form */}
      {showNewSetForm && (
        <form
          onSubmit={handleCreateSet}
          className="flex items-end gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4"
        >
          <div className="flex-1 space-y-1">
            <label className="text-sm text-zinc-400">Practice Set Title</label>
            <Input
              value={newSetTitle}
              onChange={(e) => setNewSetTitle(e.target.value)}
              placeholder="e.g. Lesson 1 Practice"
              className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={isCreatingSet || !newSetTitle.trim()}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {isCreatingSet ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowNewSetForm(false);
              setNewSetTitle("");
            }}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Button>
        </form>
      )}

      {/* Empty state */}
      {practiceSets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 px-6 py-16">
          <FolderPlus className="mb-3 h-10 w-10 text-zinc-500" />
          <p className="text-sm text-zinc-400">
            No practice sets yet. Create your first practice set to start adding
            exercises.
          </p>
        </div>
      )}

      {/* Practice sets with exercises */}
      {/* Assignment Dialog */}
      {assigningSetId && (
        <AssignmentDialog
          practiceSetId={assigningSetId}
          practiceSetTitle={
            practiceSets.find((s) => s.id === assigningSetId)?.title ?? ""
          }
          open={!!assigningSetId}
          onOpenChange={(open) => {
            if (!open) setAssigningSetId(null);
          }}
        />
      )}

      {practiceSets.map((set) => {
        const setExercises = exercisesBySet.get(set.id) ?? [];
        const isExpanded = expandedSets.has(set.id);
        const statusMeta = STATUS_BADGE[set.status] ?? STATUS_BADGE.draft;

        return (
          <div
            key={set.id}
            className="rounded-lg border border-zinc-700 bg-zinc-800/50"
          >
            {/* Set header */}
            <div className="flex items-center px-4 py-3">
              <button
                type="button"
                onClick={() => toggleSet(set.id)}
                className="flex flex-1 items-center gap-3 text-left transition-colors hover:opacity-80"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <h3 className="truncate text-sm font-semibold text-zinc-100">
                    {set.title}
                  </h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                      statusMeta.className
                    )}
                  >
                    {statusMeta.label}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {setExercises.length}{" "}
                    {setExercises.length === 1 ? "exercise" : "exercises"}
                  </span>
                </div>
              </button>
              {set.status === "published" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssigningSetId(set.id);
                  }}
                  className="ml-3 border-zinc-600 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                >
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                  Assign
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/admin/practice-sets/${set.id}/builder`);
                }}
                className="ml-3 border-zinc-600 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                <Blocks className="mr-1.5 h-3.5 w-3.5" />
                Builder
              </Button>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-zinc-700 px-4 py-4">
                <ExerciseList
                  exercises={setExercises}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isDeleting={deletingId ?? undefined}
                />
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(`/admin/exercises/new?setId=${set.id}`)
                    }
                    className="border-zinc-600 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Exercise
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
