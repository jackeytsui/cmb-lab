"use client";

import Link from "next/link";
import Image from "next/image";
import { format, isPast } from "date-fns";
import { Check, Clock } from "lucide-react";
import {
  type ResolvedVideoAssignment,
  COMPLETION_THRESHOLD,
} from "@/types/video";

interface AssignedVideoCardProps {
  assignment: ResolvedVideoAssignment;
}

export function AssignedVideoCard({ assignment }: AssignedVideoCardProps) {
  const displayTitle =
    assignment.title || assignment.sessionTitle || "Untitled Video";
  const truncatedNotes =
    assignment.notes && assignment.notes.length > 60
      ? assignment.notes.slice(0, 60) + "..."
      : assignment.notes;

  const isCompleted =
    assignment.completionPercent !== null &&
    assignment.completionPercent >= COMPLETION_THRESHOLD;
  const isOverdue =
    assignment.dueDate && isPast(new Date(assignment.dueDate)) && !isCompleted;

  return (
    <Link
      href={`/dashboard/listening?videoId=${assignment.youtubeVideoId}`}
      className="group block rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-blue-500/50 transition-colors"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-zinc-800">
        <Image
          src={`https://img.youtube.com/vi/${assignment.youtubeVideoId}/mqdefault.jpg`}
          alt={displayTitle}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <h4 className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
          {displayTitle}
        </h4>

        {truncatedNotes && (
          <p className="text-xs text-zinc-400 truncate">{truncatedNotes}</p>
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

          {/* Progress indicator */}
          {assignment.completionPercent === null ? (
            <span className="text-xs text-zinc-500">Not started</span>
          ) : isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <Check className="h-3 w-3" />
              Completed
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs text-blue-300 shrink-0">
                {assignment.completionPercent}%
              </span>
              <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${assignment.completionPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
