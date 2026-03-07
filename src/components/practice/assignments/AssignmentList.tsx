"use client";

import { format } from "date-fns";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

interface Assignment {
  id: string;
  targetType: string;
  targetId: string;
  dueDate: string | null;
  createdAt: string;
}

interface AssignmentListProps {
  assignments: Assignment[];
  onDelete: (id: string) => void;
  isDeleting?: string;
}

// ============================================================
// Target Type Badge Styles
// ============================================================

const TARGET_BADGE_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  course: {
    label: "Course",
    className: "bg-blue-900/50 text-blue-300 border-blue-700",
  },
  module: {
    label: "Module",
    className: "bg-purple-900/50 text-purple-300 border-purple-700",
  },
  lesson: {
    label: "Lesson",
    className: "bg-amber-900/50 text-amber-300 border-amber-700",
  },
  student: {
    label: "Student",
    className: "bg-green-900/50 text-green-300 border-green-700",
  },
  tag: {
    label: "Tag",
    className: "bg-rose-900/50 text-rose-300 border-rose-700",
  },
};

// ============================================================
// Component
// ============================================================

export function AssignmentList({
  assignments,
  onDelete,
  isDeleting,
}: AssignmentListProps) {
  if (assignments.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No assignments yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => {
        const badge = TARGET_BADGE_STYLES[assignment.targetType] ?? {
          label: assignment.targetType,
          className: "bg-zinc-700/50 text-zinc-300 border-zinc-600",
        };
        const isDeletingThis = isDeleting === assignment.id;

        return (
          <div
            key={assignment.id}
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs ${badge.className}`}
              >
                {badge.label}
              </span>
              <span className="truncate text-xs text-zinc-400">
                {assignment.targetId.slice(0, 8)}...
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {assignment.dueDate
                  ? `Due: ${format(new Date(assignment.dueDate), "MMM d, yyyy")}`
                  : "No due date"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(assignment.id)}
              disabled={isDeletingThis}
              className="h-7 w-7 shrink-0 p-0 text-zinc-400 hover:text-red-400"
            >
              {isDeletingThis ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
