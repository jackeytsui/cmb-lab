"use client";

import Link from "next/link";
import { format, isPast } from "date-fns";
import { Check, Clock, MinusCircle } from "lucide-react";
import type { ResolvedThreadAssignment } from "@/lib/thread-assignments";

interface AssignedThreadCardProps {
  assignment: ResolvedThreadAssignment;
}

export function AssignedThreadCard({ assignment }: AssignedThreadCardProps) {
  const displayTitle = assignment.threadTitle || "Untitled Thread";
  const truncatedNotes =
    assignment.notes && assignment.notes.length > 60
      ? assignment.notes.slice(0, 60) + "..."
      : assignment.notes;

  const isCompleted = assignment.completionStatus === "completed";
  const isOverdue =
    assignment.dueDate && isPast(new Date(assignment.dueDate)) && !isCompleted;

  return (
    <Link
      href={`/dashboard/threads/${assignment.threadId}`}
      className="group block rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-purple-500/50 transition-colors"
    >
      {/* Thread visual header */}
      <div className="flex h-24 items-center justify-center bg-zinc-800/50">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10">
          <svg
            className="h-6 w-6 text-purple-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 8V6a1 1 0 011-1h3m6 0h-3m-4 14H7a1 1 0 01-1-1v-3m12 0v3a1 1 0 01-1 1h-3"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <h4 className="text-sm font-medium text-white truncate group-hover:text-purple-300 transition-colors">
          {displayTitle}
        </h4>

        {truncatedNotes && (
          <p className="text-xs text-zinc-400 line-clamp-2">{truncatedNotes}</p>
        )}

        <div className="flex items-center gap-2">
          {/* Due date badge */}
          {assignment.dueDate && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                isOverdue
                  ? "bg-red-900/50 text-red-300 border border-red-700"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              <Clock className="h-3 w-3" />
              {isOverdue
                ? "Overdue"
                : format(new Date(assignment.dueDate), "MMM d")}
            </span>
          )}

          {/* Status indicator */}
          {assignment.completionStatus === "not_started" ? (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <MinusCircle className="h-3 w-3" />
              Not started
            </span>
          ) : isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <Check className="h-3 w-3" />
              Completed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
              <Clock className="h-3 w-3" />
              In Progress
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
