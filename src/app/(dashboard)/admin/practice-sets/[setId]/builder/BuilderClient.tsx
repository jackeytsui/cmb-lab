"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DragDropProvider } from "@dnd-kit/react";
import { useBuilderState } from "@/hooks/useBuilderState";
import type { BuilderState, BuilderExercise } from "@/hooks/useBuilderState";
import { BuilderPalette } from "@/components/admin/builder/BuilderPalette";
import { BuilderCanvas } from "@/components/admin/builder/BuilderCanvas";
import { BuilderToolbar } from "@/components/admin/builder/BuilderToolbar";
import { BuilderPreviewPanel } from "@/components/admin/builder/BuilderPreviewPanel";
import { ExerciseBlockEditor } from "@/components/admin/builder/ExerciseBlockEditor";
import type { ExerciseDefinition } from "@/types/exercises";
import type { PracticeSet, PracticeExercise } from "@/db/schema";

// ============================================================
// Props
// ============================================================

interface BuilderClientProps {
  practiceSet: PracticeSet;
  initialExercises: PracticeExercise[];
}

// ============================================================
// Component
// ============================================================

export function BuilderClient({
  practiceSet,
  initialExercises,
}: BuilderClientProps) {
  // ----------------------------------------------------------
  // State setup
  // ----------------------------------------------------------
  const initialState: BuilderState = {
    exercises: initialExercises.map((ex) => ({
      id: ex.id,
      type: ex.type,
      language: ex.language as "cantonese" | "mandarin" | "both",
      definition: ex.definition as ExerciseDefinition,
      sortOrder: ex.sortOrder,
      practiceSetId: ex.practiceSetId,
      isNew: false,
      isConfigured: true,
    })),
    title: practiceSet.title,
    description: practiceSet.description ?? "",
    status: practiceSet.status as "draft" | "published" | "archived",
  };

  const { state, dispatch, canUndo, canRedo, isDirty } =
    useBuilderState(initialState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  // Track server exercises for diff-based save
  const serverExercisesRef = useRef(initialExercises);

  // ----------------------------------------------------------
  // beforeunload guard
  // ----------------------------------------------------------
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // ----------------------------------------------------------
  // Batch save function
  // ----------------------------------------------------------
  async function handleSave(targetStatus: "draft" | "published") {
    setIsSaving(true);
    setSaveError(null);

    try {
      const serverExercises = serverExercisesRef.current;
      const serverIds = new Set(serverExercises.map((e) => e.id));
      const localIds = new Set(state.exercises.map((e) => e.id));

      // 1. Validate: all exercises must be configured before publishing
      if (targetStatus === "published") {
        const unconfigured = state.exercises.filter((e) => !e.isConfigured);
        if (unconfigured.length > 0) {
          setSaveError(
            `${unconfigured.length} exercise(s) need editing before publishing.`
          );
          setIsSaving(false);
          return;
        }
      }

      // 2. Create new exercises (id starts with 'temp-')
      const idMap = new Map<string, string>();
      for (const ex of state.exercises.filter((e) => e.id.startsWith("temp-"))) {
        const res = await fetch("/api/admin/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practiceSetId: practiceSet.id,
            type: ex.type,
            language: ex.language,
            definition: ex.definition,
            sortOrder: state.exercises.indexOf(ex),
          }),
        });
        if (!res.ok) throw new Error("Failed to create exercise");
        const { exercise } = await res.json();
        idMap.set(ex.id, exercise.id);
      }

      // 3. Update existing exercises (definition/language may have changed)
      for (const ex of state.exercises.filter((e) => serverIds.has(e.id))) {
        const res = await fetch(`/api/admin/exercises/${ex.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: ex.language,
            definition: ex.definition,
            sortOrder: state.exercises.indexOf(ex),
          }),
        });
        if (!res.ok) throw new Error("Failed to update exercise");
      }

      // 4. Delete removed exercises
      for (const serverEx of serverExercises) {
        if (!localIds.has(serverEx.id)) {
          const res = await fetch(`/api/admin/exercises/${serverEx.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to delete exercise");
        }
      }

      // 5. Update practice set title/description/status
      const setRes = await fetch(
        `/api/admin/practice-sets/${practiceSet.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: state.title,
            description: state.description || undefined,
            status: targetStatus,
          }),
        }
      );
      if (!setRes.ok) throw new Error("Failed to update practice set");

      // 6. Sync state: replace temp IDs with server IDs
      if (idMap.size > 0) {
        dispatch({ type: "MARK_SAVED", idMap });
      }

      // 7. Update server exercises ref for next save diff
      const refreshRes = await fetch(
        `/api/admin/practice-sets/${practiceSet.id}`
      );
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        serverExercisesRef.current = refreshData.exercises;
      }

      // Update status in builder state if changed
      if (targetStatus !== state.status) {
        dispatch({ type: "SET_STATUS", status: targetStatus });
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  // ----------------------------------------------------------
  // Duplicate function
  // ----------------------------------------------------------
  async function handleDuplicate() {
    if (
      isDirty &&
      !confirm(
        "You have unsaved changes. Duplicate will use the last saved version. Continue?"
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/practice-sets/${practiceSet.id}/duplicate`,
        {
          method: "POST",
        }
      );
      if (!res.ok) throw new Error("Failed to duplicate");
      const { practiceSet: newSet } = await res.json();
      router.push(`/admin/practice-sets/${newSet.id}/builder`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  // ----------------------------------------------------------
  // Exercise editor render function
  // ----------------------------------------------------------
  function renderEditor(exercise: BuilderExercise) {
    return (
      <ExerciseBlockEditor
        exercise={exercise}
        practiceSetId={practiceSet.id}
        onUpdate={(exerciseId, data) => {
          dispatch({
            type: "UPDATE_EXERCISE",
            exerciseId,
            data: {
              type: data.type,
              language: data.language as "cantonese" | "mandarin" | "both",
              definition: data.definition as ExerciseDefinition,
              isConfigured: true,
            },
          });
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <DragDropProvider
      onDragOver={(event: any) => {
        const { source, target } = event.operation;
        if (!source || !target) return;
        // Don't reorder palette items on the canvas during drag
        if (source.data?.source === "palette") return;

        const sourceIndex = state.exercises.findIndex(
          (e) => e.id === source.id
        );
        const targetIndex = state.exercises.findIndex(
          (e) => e.id === target.id
        );
        if (
          sourceIndex !== -1 &&
          targetIndex !== -1 &&
          sourceIndex !== targetIndex
        ) {
          dispatch({
            type: "REORDER_EXERCISES",
            fromIndex: sourceIndex,
            toIndex: targetIndex,
          });
        }
      }}
      onDragEnd={(event: any) => {
        if (event.canceled) return;
        const { source, target } = event.operation;

        // Only handle palette-to-canvas drops
        if (source?.data?.source === "palette" && target) {
          const exerciseType = source.data.type as string;
          const targetIndex = target.data?.index as number | undefined;
          dispatch({
            type: "ADD_EXERCISE",
            exerciseType,
            language: "both",
            atIndex: targetIndex,
          });
        }
      }}
    >
      <div className="flex h-screen flex-col bg-zinc-900 text-white">
        {/* Toolbar */}
        <BuilderToolbar
          title={state.title}
          status={state.status}
          canUndo={canUndo}
          canRedo={canRedo}
          isDirty={isDirty}
          isSaving={isSaving}
          onUndo={() => dispatch({ type: "UNDO" })}
          onRedo={() => dispatch({ type: "REDO" })}
          onSaveDraft={() => handleSave("draft")}
          onPublish={() => handleSave("published")}
          onDuplicate={handleDuplicate}
          onTitleChange={(title) =>
            dispatch({ type: "UPDATE_SET_META", title })
          }
        />

        {/* Save error banner */}
        {saveError && (
          <div className="mx-4 mt-2 rounded-md border border-red-700 bg-red-900/30 px-4 py-2 text-sm text-red-300">
            {saveError}
          </div>
        )}

        {/* Main layout: Palette | Canvas | Preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Palette */}
          <div className="shrink-0 overflow-y-auto border-r border-zinc-700 p-4">
            <BuilderPalette />
          </div>

          {/* Center: Canvas */}
          <div className="flex-1 overflow-y-auto p-6">
            <BuilderCanvas
              exercises={state.exercises}
              editingId={editingId}
              onEdit={(id) => setEditingId(id)}
              onRemove={(id) => {
                dispatch({ type: "REMOVE_EXERCISE", exerciseId: id });
                if (editingId === id) setEditingId(null);
              }}
              renderEditor={renderEditor}
            />
          </div>

          {/* Right: Preview */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-zinc-700 p-4">
            <BuilderPreviewPanel exercises={state.exercises} />
          </div>
        </div>
      </div>
    </DragDropProvider>
  );
}
