"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type ContentType = "lesson" | "module";

interface MoveContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ContentType;
  contentId: string;
  contentTitle: string;
  currentParentId: string;
  onSuccess: () => void;
}

interface TargetOption {
  id: string;
  title: string;
  parentTitle?: string;
}

/**
 * Modal for moving lessons to different modules or modules to different courses.
 */
export function MoveContentModal({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentTitle,
  currentParentId,
  onSuccess,
}: MoveContentModalProps) {
  const [options, setOptions] = useState<TargetOption[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch target options
  useEffect(() => {
    if (open) {
      fetchOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchOptions is stable, only re-fetch when open/contentType changes
  }, [open, contentType]);

  const fetchOptions = async () => {
    setLoading(true);
    setError(null);

    try {
      if (contentType === "lesson") {
        // Fetch all modules (grouped by course)
        const res = await fetch("/api/admin/courses");
        if (!res.ok) throw new Error("Failed to fetch courses");

        const { courses } = await res.json();
        const allModules: TargetOption[] = [];

        for (const course of courses) {
          const courseRes = await fetch(`/api/admin/courses/${course.id}`);
          if (!courseRes.ok) continue;

          const courseData = await courseRes.json();
          for (const mod of courseData.modules || []) {
            if (mod.id !== currentParentId) {
              allModules.push({
                id: mod.id,
                title: mod.title,
                parentTitle: course.title,
              });
            }
          }
        }

        setOptions(allModules);
      } else {
        // Fetch all courses for moving modules
        const res = await fetch("/api/admin/courses");
        if (!res.ok) throw new Error("Failed to fetch courses");

        const { courses } = await res.json();
        setOptions(
          courses
            .filter((c: { id: string }) => c.id !== currentParentId)
            .map((c: { id: string; title: string }) => ({
              id: c.id,
              title: c.title,
            }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load options");
    } finally {
      setLoading(false);
    }
  };

  const handleMove = async () => {
    if (!selectedTarget) {
      setError("Please select a destination");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const endpoint =
        contentType === "lesson"
          ? `/api/admin/lessons/${contentId}/move`
          : `/api/admin/modules/${contentId}/move`;

      const bodyKey =
        contentType === "lesson" ? "targetModuleId" : "targetCourseId";

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [bodyKey]: selectedTarget }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to move content");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move");
    } finally {
      setSubmitting(false);
    }
  };

  const parentLabel = contentType === "lesson" ? "module" : "course";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-zinc-900 border-zinc-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Move {contentType}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Move &quot;{contentTitle}&quot; to a different {parentLabel}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-zinc-400">
            Loading {parentLabel}s...
          </div>
        ) : options.length === 0 ? (
          <div className="py-8 text-center text-zinc-400">
            No other {parentLabel}s available.
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Select destination {parentLabel}
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 text-white px-3 py-2"
            >
              <option value="">Select {parentLabel}...</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.parentTitle
                    ? `${option.parentTitle} > ${option.title}`
                    : option.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleMove}
            disabled={submitting || !selectedTarget}
          >
            {submitting ? "Moving..." : `Move ${contentType}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
