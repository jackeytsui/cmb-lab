"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// Types
// ============================================================

interface VideoAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

type TargetType = "course" | "module" | "lesson" | "student" | "tag";

interface TargetOption {
  id: string;
  title?: string;
  name?: string;
  email?: string;
  color?: string;
}

// ============================================================
// Constants
// ============================================================

const TARGET_TYPE_OPTIONS: { value: TargetType; label: string }[] = [
  { value: "course", label: "Course" },
  { value: "module", label: "Module" },
  { value: "lesson", label: "Lesson" },
  { value: "student", label: "Student" },
  { value: "tag", label: "Tag" },
];

// ============================================================
// Component
// ============================================================

export function VideoAssignmentDialog({
  open,
  onOpenChange,
  onCreated,
}: VideoAssignmentDialogProps) {
  // Form state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Target options for dropdowns
  const [courseOptions, setCourseOptions] = useState<TargetOption[]>([]);
  const [moduleOptions, setModuleOptions] = useState<TargetOption[]>([]);
  const [lessonOptions, setLessonOptions] = useState<TargetOption[]>([]);
  const [studentOptions, setStudentOptions] = useState<TargetOption[]>([]);
  const [tagOptions, setTagOptions] = useState<TargetOption[]>([]);

  // Loading/error states
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog closes
  const resetForm = useCallback(() => {
    setYoutubeUrl("");
    setTitle("");
    setNotes("");
    setTargetType("");
    setSelectedCourseId("");
    setSelectedModuleId("");
    setSelectedTargetId("");
    setDueDate("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  // --------------------------------------------------------
  // Fetch targets helper (reuses existing assignment targets API)
  // --------------------------------------------------------
  async function fetchTargets(
    type: string,
    parentId?: string
  ): Promise<TargetOption[]> {
    const params = new URLSearchParams({ type });
    if (parentId) params.set("parentId", parentId);

    const res = await fetch(
      `/api/admin/assignments/targets?${params.toString()}`
    );
    if (!res.ok) throw new Error("Failed to load targets");
    const data = await res.json();
    return data.targets ?? [];
  }

  // --------------------------------------------------------
  // Handle target type change
  // --------------------------------------------------------
  async function handleTargetTypeChange(value: string) {
    const newType = value as TargetType;
    setTargetType(newType);
    setSelectedCourseId("");
    setSelectedModuleId("");
    setSelectedTargetId("");
    setError(null);

    setIsLoadingTargets(true);
    try {
      switch (newType) {
        case "course": {
          const targets = await fetchTargets("course");
          setCourseOptions(targets);
          break;
        }
        case "module":
        case "lesson": {
          const targets = await fetchTargets("course");
          setCourseOptions(targets);
          setModuleOptions([]);
          setLessonOptions([]);
          break;
        }
        case "student": {
          const targets = await fetchTargets("student");
          setStudentOptions(targets);
          break;
        }
        case "tag": {
          const targets = await fetchTargets("tag");
          setTagOptions(targets);
          break;
        }
      }
    } catch {
      setError("Failed to load target options");
    } finally {
      setIsLoadingTargets(false);
    }
  }

  // --------------------------------------------------------
  // Handle cascading course selection
  // --------------------------------------------------------
  async function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedModuleId("");
    setSelectedTargetId("");

    if (targetType === "course") {
      setSelectedTargetId(courseId);
      return;
    }

    // Load modules for selected course
    setIsLoadingTargets(true);
    try {
      const targets = await fetchTargets("module", courseId);
      setModuleOptions(targets);
      setLessonOptions([]);
    } catch {
      setError("Failed to load modules");
    } finally {
      setIsLoadingTargets(false);
    }
  }

  // --------------------------------------------------------
  // Handle cascading module selection
  // --------------------------------------------------------
  async function handleModuleChange(moduleId: string) {
    setSelectedModuleId(moduleId);
    setSelectedTargetId("");

    if (targetType === "module") {
      setSelectedTargetId(moduleId);
      return;
    }

    // Load lessons for selected module
    setIsLoadingTargets(true);
    try {
      const targets = await fetchTargets("lesson", moduleId);
      setLessonOptions(targets);
    } catch {
      setError("Failed to load lessons");
    } finally {
      setIsLoadingTargets(false);
    }
  }

  // --------------------------------------------------------
  // Handle final target selection
  // --------------------------------------------------------
  function handleTargetSelect(targetId: string) {
    setSelectedTargetId(targetId);
  }

  // --------------------------------------------------------
  // Create video assignment
  // --------------------------------------------------------
  async function handleCreate() {
    if (!youtubeUrl || !targetType || !selectedTargetId) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/video-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl,
          title: title || undefined,
          notes: notes || undefined,
          targetType,
          targetId: selectedTargetId,
          dueDate: dueDate || undefined,
        }),
      });

      if (res.status === 409) {
        setError("This video is already assigned to this target.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create video assignment");
      }

      // Success: close dialog and notify parent
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create video assignment"
      );
    } finally {
      setIsCreating(false);
    }
  }

  // --------------------------------------------------------
  // Determine if "Create" button should be enabled
  // --------------------------------------------------------
  const canCreate = !!youtubeUrl && !!targetType && !!selectedTargetId && !isCreating;

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-700 bg-zinc-900 text-zinc-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            New Video Assignment
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Assign a YouTube video to a course, module, lesson, student, or tag.
          </DialogDescription>
        </DialogHeader>

        {/* Error message */}
        {error && (
          <div className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* YouTube URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            YouTube URL
          </label>
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex h-9 w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1 text-sm text-zinc-200 shadow-xs outline-none placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {/* Title (optional) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional custom title"
            className="flex h-9 w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1 text-sm text-zinc-200 shadow-xs outline-none placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {/* Notes (optional) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instructions for students..."
            rows={3}
            className="flex w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 shadow-xs outline-none placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 resize-none"
          />
        </div>

        {/* Target Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Target Type
          </label>
          <Select value={targetType} onValueChange={handleTargetTypeChange}>
            <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
              <SelectValue placeholder="Select target type..." />
            </SelectTrigger>
            <SelectContent className="border-zinc-600 bg-zinc-800">
              {TARGET_TYPE_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cascading selects */}
        {targetType && (
          <div className="space-y-3">
            {isLoadingTargets && (
              <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading options...
              </div>
            )}

            {/* Course select (for course, module, lesson types) */}
            {(targetType === "course" ||
              targetType === "module" ||
              targetType === "lesson") && (
              <div className="space-y-1.5">
                <label className="text-sm text-zinc-400">Course</label>
                <Select
                  value={selectedCourseId}
                  onValueChange={handleCourseChange}
                >
                  <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-600 bg-zinc-800">
                    {courseOptions.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                      >
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Module select (for module and lesson types) */}
            {(targetType === "module" || targetType === "lesson") &&
              selectedCourseId && (
                <div className="space-y-1.5">
                  <label className="text-sm text-zinc-400">Module</label>
                  <Select
                    value={selectedModuleId}
                    onValueChange={handleModuleChange}
                  >
                    <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
                      <SelectValue placeholder="Select a module..." />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-600 bg-zinc-800">
                      {moduleOptions.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                        >
                          {m.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {/* Lesson select (for lesson type only) */}
            {targetType === "lesson" && selectedModuleId && (
              <div className="space-y-1.5">
                <label className="text-sm text-zinc-400">Lesson</label>
                <Select
                  value={selectedTargetId}
                  onValueChange={handleTargetSelect}
                >
                  <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
                    <SelectValue placeholder="Select a lesson..." />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-600 bg-zinc-800">
                    {lessonOptions.map((l) => (
                      <SelectItem
                        key={l.id}
                        value={l.id}
                        className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                      >
                        {l.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Student select */}
            {targetType === "student" && (
              <div className="space-y-1.5">
                <label className="text-sm text-zinc-400">Student</label>
                <Select
                  value={selectedTargetId}
                  onValueChange={handleTargetSelect}
                >
                  <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
                    <SelectValue placeholder="Select a student..." />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-600 bg-zinc-800">
                    {studentOptions.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                      >
                        {s.name ?? s.email ?? s.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tag select */}
            {targetType === "tag" && (
              <div className="space-y-1.5">
                <label className="text-sm text-zinc-400">Tag</label>
                <Select
                  value={selectedTargetId}
                  onValueChange={handleTargetSelect}
                >
                  <SelectTrigger className="w-full border-zinc-600 bg-zinc-800 text-zinc-200">
                    <SelectValue placeholder="Select a tag..." />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-600 bg-zinc-800">
                    {tagOptions.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: t.color ?? "#6b7280" }}
                          />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Due date */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Due date (optional)
          </label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="flex h-9 w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1 text-sm text-zinc-200 shadow-xs outline-none placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {/* Create button */}
        <Button
          onClick={handleCreate}
          disabled={!canCreate}
          className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Assignment"
          )}
        </Button>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
