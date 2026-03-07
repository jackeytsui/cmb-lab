"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface Item {
  id: string;
  title: string;
  description?: string | null;
}

interface BatchEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  itemType: "course" | "module" | "lesson";
  onSuccess: () => void;
}

/**
 * Modal for batch editing metadata of multiple items.
 */
export function BatchEditModal({
  open,
  onOpenChange,
  items,
  itemType,
  onSuccess,
}: BatchEditModalProps) {
  const [updates, setUpdates] = useState<Record<string, { title: string; description: string }>>(
    () =>
      Object.fromEntries(
        items.map((item) => [
          item.id,
          { title: item.title, description: item.description || "" },
        ])
      )
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const updateList = Object.entries(updates).map(([id, data]) => ({
        id,
        title: data.title,
        description: data.description || null,
      }));

      const res = await fetch("/api/admin/batch/metadata", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: itemType, updates: updateList }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update metadata");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (
    id: string,
    field: "title" | "description",
    value: string
  ) => {
    setUpdates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Edit {items.length} {itemType}
            {items.length > 1 ? "s" : ""}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Update the title and description for each {itemType}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="p-4 rounded-lg border border-zinc-700 bg-zinc-800 space-y-3"
            >
              <p className="text-xs text-zinc-500">
                {itemType} {index + 1} of {items.length}
              </p>

              <div className="space-y-2">
                <Label htmlFor={`title-${item.id}`} className="text-zinc-300">
                  Title
                </Label>
                <Input
                  id={`title-${item.id}`}
                  value={updates[item.id]?.title || ""}
                  onChange={(e) =>
                    updateField(item.id, "title", e.target.value)
                  }
                  className="border-zinc-600 bg-zinc-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor={`desc-${item.id}`}
                  className="text-zinc-300"
                >
                  Description
                </Label>
                <Textarea
                  id={`desc-${item.id}`}
                  value={updates[item.id]?.description || ""}
                  onChange={(e) =>
                    updateField(item.id, "description", e.target.value)
                  }
                  rows={2}
                  className="border-zinc-600 bg-zinc-700 text-white resize-y"
                />
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </AlertDialogCancel>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save All"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
