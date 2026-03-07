"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { ClipboardList, Check, Clock, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResolvedAssignment } from "@/lib/assignments";

// ============================================================
// Types
// ============================================================

type StatusFilter = "all" | "pending" | "completed";
type SortBy = "due_date" | "assigned_date" | "title";

interface PracticeDashboardProps {
  assignments: ResolvedAssignment[];
}

// ============================================================
// Target type badge colors
// ============================================================

const TARGET_BADGE_COLORS: Record<string, string> = {
  course: "bg-blue-500/20 text-blue-400",
  module: "bg-purple-500/20 text-purple-400",
  lesson: "bg-amber-500/20 text-amber-400",
  student: "bg-emerald-500/20 text-emerald-400",
  tag: "bg-rose-500/20 text-rose-400",
};

// ============================================================
// Component
// ============================================================

export function PracticeDashboard({ assignments }: PracticeDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("due_date");

  // Count by status for badge numbers
  const pendingCount = assignments.filter((a) => a.status === "pending").length;
  const completedCount = assignments.filter(
    (a) => a.status === "completed"
  ).length;

  // Filter and sort
  const filtered = useMemo(() => {
    let result = assignments;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "due_date": {
          // Assignments with due dates first (ascending), then those without
          if (a.dueDate && b.dueDate) {
            return (
              new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
            );
          }
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          return 0;
        }
        case "assigned_date": {
          // Newest first
          return (
            new Date(b.assignedAt).getTime() -
            new Date(a.assignedAt).getTime()
          );
        }
        case "title": {
          return a.practiceSetTitle.localeCompare(b.practiceSetTitle);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [assignments, statusFilter, sortBy]);

  // Empty state: no assignments at all
  if (assignments.length === 0) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="w-16 h-16 text-zinc-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300">
          No practice assignments yet
        </h2>
        <p className="text-zinc-500 mt-2 max-w-md mx-auto">
          Your coach hasn&apos;t assigned any practice sets yet. Check back
          later!
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status filter buttons */}
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          <StatusButton
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="All"
            count={assignments.length}
          />
          <StatusButton
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
            label="Pending"
            count={pendingCount}
            dotColor="bg-amber-400"
          />
          <StatusButton
            active={statusFilter === "completed"}
            onClick={() => setStatusFilter("completed")}
            label="Completed"
            count={completedCount}
            dotColor="bg-emerald-400"
          />
        </div>

        {/* Sort dropdown */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[160px] bg-zinc-800 border-zinc-700 text-zinc-300 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="due_date" className="text-zinc-300">
              Due Date
            </SelectItem>
            <SelectItem value="assigned_date" className="text-zinc-300">
              Date Assigned
            </SelectItem>
            <SelectItem value="title" className="text-zinc-300">
              Title
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Summary text */}
        <span className="text-sm text-zinc-500 ml-auto">
          Showing {filtered.length} of {assignments.length} assignments
        </span>
      </div>

      {/* Filtered empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-400">
            No assignments match your filters
          </h3>
          <p className="text-zinc-500 mt-1">
            Try changing the status filter or sort order
          </p>
        </div>
      ) : (
        /* Assignment cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((assignment) => (
            <AssignmentCard key={assignment.assignmentId} assignment={assignment} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatusButton({
  active,
  onClick,
  label,
  count,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
        active
          ? "bg-zinc-700 text-white"
          : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-300"
      }`}
    >
      {dotColor && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
      {label}
      <span className="text-xs text-zinc-500">({count})</span>
    </button>
  );
}

function AssignmentCard({ assignment }: { assignment: ResolvedAssignment }) {
  const isOverdue =
    assignment.status === "pending" &&
    assignment.dueDate &&
    isPast(new Date(assignment.dueDate));

  const targetBadgeClass =
    TARGET_BADGE_COLORS[assignment.targetType] ?? "bg-zinc-500/20 text-zinc-400";

  return (
    <Link
      href={`/practice/${assignment.practiceSetId}`}
      className="block rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 hover:border-zinc-500 transition-colors"
    >
      {/* Top row: title + status badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-white leading-tight">
          {assignment.practiceSetTitle}
        </h3>
        {assignment.status === "completed" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 shrink-0">
            <Check className="w-3 h-3" />
            Completed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-600/30 text-zinc-400 shrink-0">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 line-clamp-2 mb-3">
        {assignment.practiceSetDescription || (
          <span className="italic">No description</span>
        )}
      </p>

      {/* Score row (if completed) */}
      {assignment.status === "completed" && assignment.bestScore !== null && (
        <div className="text-sm text-emerald-400 font-medium mb-2">
          Score: {assignment.bestScore}%
        </div>
      )}

      {/* Overdue indicator */}
      {isOverdue && (
        <div className="flex items-center gap-1 text-sm text-red-400 mb-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Overdue
        </div>
      )}

      {/* Bottom row: target type + due date */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${targetBadgeClass}`}
        >
          {assignment.targetType}
        </span>
        <span>
          {assignment.dueDate
            ? format(new Date(assignment.dueDate), "MMM d, yyyy")
            : "No due date"}
        </span>
      </div>
    </Link>
  );
}
