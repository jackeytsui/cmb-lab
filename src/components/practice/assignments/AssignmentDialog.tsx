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
import { AssignmentList } from "./AssignmentList";

// ============================================================
// Types
// ============================================================

interface AssignmentDialogProps {
  practiceSetId: string;
  practiceSetTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TargetType = "course" | "module" | "lesson" | "student" | "tag";

interface TargetOption {
  id: string;
  title?: string;
  name?: string;
  email?: string;
  color?: string;
}

interface Assignment {
  id: string;
  targetType: string;
  targetId: string;
  dueDate: string | null;
  createdAt: string;
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

export function AssignmentDialog({
  practiceSetId,
  practiceSetTitle,
  open,
  onOpenChange,
}: AssignmentDialogProps) {
  // Form state
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

  // Existing assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Loading/error states
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --------------------------------------------------------
  // Fetch existing assignments
  // --------------------------------------------------------
  const fetchAssignments = useCallback(async () => {
    setIsLoadingAssignments(true);
    try {
      const res = await fetch(
        `/api/admin/assignments?practiceSetId=${practiceSetId}`
      );
      if (!res.ok) throw new Error("Failed to load assignments");
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch {
      // Silent failure for assignment list load
    } finally {
      setIsLoadingAssignments(false);
    }
  }, [practiceSetId]);

  // Fetch assignments when dialog opens
  useEffect(() => {
    if (open) {
      fetchAssignments();
    }
  }, [open, fetchAssignments]);

  // --------------------------------------------------------
  // Fetch targets helper
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
    setSuccessMessage(null);

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
          // Load courses first for cascading
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
  // Create assignment
  // --------------------------------------------------------
  async function handleCreate() {
    if (!targetType || !selectedTargetId) return;

    setIsCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceSetId,
          targetType,
          targetId: selectedTargetId,
          dueDate: dueDate || undefined,
        }),
      });

      if (res.status === 409) {
        setError("This target is already assigned to this practice set.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create assignment");
      }

      // Success: refresh list and reset form
      setSuccessMessage("Assignment created successfully.");
      setTargetType("");
      setSelectedCourseId("");
      setSelectedModuleId("");
      setSelectedTargetId("");
      setDueDate("");
      await fetchAssignments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create assignment"
      );
    } finally {
      setIsCreating(false);
    }
  }

  // --------------------------------------------------------
  // Delete assignment
  // --------------------------------------------------------
  async function handleDelete(id: string) {
    setIsDeletingId(id);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/assignments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete assignment");

      await fetchAssignments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete assignment"
      );
    } finally {
      setIsDeletingId(undefined);
    }
  }

  // --------------------------------------------------------
  // Determine if "Assign" button should be enabled
  // --------------------------------------------------------
  const canCreate = !!targetType && !!selectedTargetId && !isCreating;

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-700 bg-zinc-900 text-zinc-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            Assign: {practiceSetTitle}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Assign this practice set to a course, module, lesson, student, or
            tag.
          </DialogDescription>
        </DialogHeader>

        {/* Error / success messages */}
        {error && (
          <div className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md border border-green-700 bg-green-900/30 px-3 py-2 text-sm text-green-300">
            {successMessage}
          </div>
        )}

        {/* Section 1: Target Type */}
        <div className="space-y-3">
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

        {/* Section 2: Cascading selects */}
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

        {/* Section 3: Due date */}
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

        {/* Section 4: Assign button */}
        <Button
          onClick={handleCreate}
          disabled={!canCreate}
          className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Assigning...
            </>
          ) : (
            "Assign"
          )}
        </Button>

        {/* Divider */}
        <div className="border-t border-zinc-700" />

        {/* Section 5: Existing assignments */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300">
            Existing Assignments
            {assignments.length > 0 && (
              <span className="ml-2 text-xs text-zinc-500">
                ({assignments.length})
              </span>
            )}
          </h4>
          {isLoadingAssignments ? (
            <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assignments...
            </div>
          ) : (
            <AssignmentList
              assignments={assignments}
              onDelete={handleDelete}
              isDeleting={isDeletingId}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
