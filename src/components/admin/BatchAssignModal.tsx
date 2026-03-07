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
import type { VideoUpload } from "@/db/schema/uploads";

interface Lesson {
  id: string;
  title: string;
  moduleId: string;
  muxPlaybackId: string | null;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface BatchAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedVideos: VideoUpload[];
  onSuccess: () => void;
}

/**
 * Modal for batch assigning videos to lessons.
 * Shows list of selected videos and lesson selector for each.
 */
export function BatchAssignModal({
  open,
  onOpenChange,
  selectedVideos,
  onSuccess,
}: BatchAssignModalProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch modules and lessons
  useEffect(() => {
    if (open) {
      fetchModules();
    }
  }, [open]);

  const fetchModules = async () => {
    setLoading(true);
    try {
      // Fetch all courses with modules and lessons
      const res = await fetch("/api/admin/courses");
      if (!res.ok) throw new Error("Failed to fetch courses");

      const data = await res.json();

      // Flatten to modules with lessons
      const allModules: Module[] = [];
      for (const course of data.courses || []) {
        const courseRes = await fetch(`/api/admin/courses/${course.id}`);
        if (!courseRes.ok) continue;

        const courseData = await courseRes.json();
        for (const mod of courseData.modules || []) {
          allModules.push({
            id: mod.id,
            title: `${course.title} > ${mod.title}`,
            lessons: mod.lessons.filter((l: Lesson) => !l.muxPlaybackId),
          });
        }
      }

      setModules(allModules.filter((m) => m.lessons.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const assignmentPairs = Object.entries(assignments)
        .filter(([, lessonId]) => lessonId)
        .map(([uploadId, lessonId]) => ({ uploadId, lessonId }));

      if (assignmentPairs.length === 0) {
        setError("Please select at least one lesson to assign");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/admin/uploads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: assignmentPairs }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to assign videos");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign videos");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Assign Videos to Lessons
          </AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Select a lesson for each video. Only lessons without videos are shown.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-zinc-400">Loading lessons...</div>
        ) : modules.length === 0 ? (
          <div className="py-8 text-center text-zinc-400">
            No lessons available for assignment.
            <p className="text-sm mt-1">All lessons already have videos.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedVideos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-4 p-3 rounded-lg border border-zinc-700 bg-zinc-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {video.filename}
                  </p>
                  {video.durationSeconds && (
                    <p className="text-xs text-zinc-400">
                      {Math.floor(video.durationSeconds / 60)}:
                      {String(video.durationSeconds % 60).padStart(2, "0")}
                    </p>
                  )}
                </div>

                <select
                  value={assignments[video.id] || ""}
                  onChange={(e) =>
                    setAssignments((prev) => ({
                      ...prev,
                      [video.id]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded-md border border-zinc-600 bg-zinc-700 text-white px-3 py-2 text-sm"
                >
                  <option value="">Select lesson...</option>
                  {modules.map((mod) => (
                    <optgroup key={mod.id} label={mod.title}>
                      {mod.lessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {lesson.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleAssign}
            disabled={submitting || Object.keys(assignments).length === 0}
          >
            {submitting ? "Assigning..." : "Assign Videos"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
