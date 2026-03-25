"use client";

import { useState, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Plus, Check, Loader2, Trash2, Palette } from "lucide-react";
import { TagBadge, TAG_COLORS } from "./TagBadge";
import { ErrorAlert } from "@/components/ui/error-alert";

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
}

interface TagManagerProps {
  studentId: string;
  currentTags: Tag[];
  allTags: Tag[];
  onTagsChange: () => void;
}

/**
 * TagManager - Popover for managing tags on a student.
 *
 * Shows all available tags with checkboxes. Toggling assigns/removes.
 * Includes inline "Create Tag" form with name, color picker, and type.
 */
export function TagManager({
  studentId,
  currentTags,
  allTags,
  onTagsChange,
}: TagManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const assignedTagIds = new Set(currentTags.map((t) => t.id));

  const handleToggleTag = useCallback(
    async (tagId: string, isAssigned: boolean) => {
      setToggling(tagId);
      setOperationError(null);
      try {
        if (isAssigned) {
          await fetch(`/api/students/${studentId}/tags`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          });
        } else {
          await fetch(`/api/students/${studentId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          });
        }
        onTagsChange();
      } catch (error) {
        console.error("Failed to toggle tag:", error);
        setOperationError("Failed to update tag. Please try again.");
      } finally {
        setToggling(null);
      }
    },
    [studentId, onTagsChange]
  );

  const handleCreateTag = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setOperationError(null);
    try {
      // 1. Create the tag
      const createRes = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          type: "coach",
        }),
      });

      if (!createRes.ok) throw new Error("Failed to create tag");

      const { tag } = await createRes.json();

      // 2. Auto-assign to this student
      await fetch(`/api/students/${studentId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });

      setNewName("");
      setShowCreate(false);
      onTagsChange();
    } catch (error) {
      console.error("Failed to create tag:", error);
      setOperationError("Failed to create tag. Please try again.");
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, studentId, onTagsChange]);

  const handleDeleteTag = useCallback(
    async (tagId: string, tagName: string) => {
      if (!confirm(`Delete tag "${tagName}"? This removes it from all students.`)) return;
      setDeleting(tagId);
      setOperationError(null);
      try {
        const res = await fetch(`/api/admin/tags/${tagId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete tag");
        onTagsChange();
      } catch (error) {
        console.error("Failed to delete tag:", error);
        setOperationError("Failed to delete tag. Please try again.");
      } finally {
        setDeleting(null);
      }
    },
    [onTagsChange]
  );

  const handleUpdateColor = useCallback(
    async (tagId: string, color: string) => {
      setOperationError(null);
      try {
        const res = await fetch(`/api/admin/tags/${tagId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color }),
        });
        if (!res.ok) throw new Error("Failed to update color");
        setEditingColor(null);
        onTagsChange();
      } catch (error) {
        console.error("Failed to update tag color:", error);
        setOperationError("Failed to update color. Please try again.");
      }
    },
    [onTagsChange]
  );

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          aria-label="Manage tags"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3"
          sideOffset={5}
          align="start"
        >
          <div className="text-sm font-medium text-zinc-300 mb-2">
            Manage Tags
          </div>

          {/* Operation error */}
          {operationError && (
            <ErrorAlert
              message={operationError}
              className="mb-2"
            />
          )}

          {/* Tag list with checkboxes */}
          <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {allTags.length === 0 && (
              <p className="text-xs text-zinc-500 py-2">
                No tags yet. Create one below.
              </p>
            )}
            {allTags.map((tag) => {
              const isAssigned = assignedTagIds.has(tag.id);
              const isLoading = toggling === tag.id;
              const isDeleting = deleting === tag.id;
              const isEditingThisColor = editingColor === tag.id;

              return (
                <div key={tag.id} className="space-y-1">
                  <div className="flex items-center gap-1 w-full px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors group/tag">
                    <button
                      onClick={() => handleToggleTag(tag.id, isAssigned)}
                      disabled={isLoading}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isAssigned
                            ? "bg-white/10 border-white/30"
                            : "border-zinc-600"
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                        ) : isAssigned ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : null}
                      </div>
                      <TagBadge
                        name={tag.name}
                        color={tag.color}
                        type={tag.type}
                      />
                    </button>
                    <button
                      onClick={() => setEditingColor(isEditingThisColor ? null : tag.id)}
                      className="opacity-0 group-hover/tag:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all"
                      aria-label={`Edit color for ${tag.name}`}
                    >
                      <Palette className="w-3 h-3 text-zinc-400" />
                    </button>
                    <button
                      onClick={() => handleDeleteTag(tag.id, tag.name)}
                      disabled={isDeleting}
                      className="opacity-0 group-hover/tag:opacity-100 p-1 rounded hover:bg-red-900/50 transition-all"
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3 text-red-400" />
                      )}
                    </button>
                  </div>
                  {isEditingThisColor && (
                    <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                      {TAG_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleUpdateColor(tag.id, color)}
                          className={`w-5 h-5 rounded-full border-2 transition-all ${
                            tag.color === color
                              ? "border-white scale-110"
                              : "border-transparent hover:border-zinc-500"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Set color to ${color}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create tag section */}
          {showCreate ? (
            <div className="border-t border-zinc-700 pt-3 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                  if (e.key === "Escape") setShowCreate(false);
                }}
              />

              {/* Color grid */}
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      newColor === color
                        ? "border-white scale-110"
                        : "border-transparent hover:border-zinc-500"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateTag}
                  disabled={creating || !newName.trim()}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
                >
                  {creating ? "Creating..." : "Create & Assign"}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="text-xs text-zinc-400 hover:text-white px-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full text-xs text-cyan-400 hover:text-cyan-300 text-left py-1 transition-colors"
            >
              + Create new tag
            </button>
          )}

          <Popover.Arrow className="fill-zinc-700" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
