"use client";

import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface PracticeSetCardProps {
  practiceSetId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  exerciseCount: number;
}

export function PracticeSetCard({
  practiceSetId,
  title,
  description: _description,
  dueDate,
  exerciseCount,
}: PracticeSetCardProps) {
  return (
    <Link
      href={`/practice/${practiceSetId}`}
      className="flex items-center gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 hover:border-emerald-600/50 transition-colors group"
    >
      <div className="flex-shrink-0">
        <ClipboardList className="h-5 w-5 text-emerald-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-emerald-200 truncate">
          {title}
        </p>
        <p className="text-xs text-zinc-400">
          {exerciseCount > 0
            ? `${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""}`
            : "Practice set"}
          {dueDate && (
            <span className="ml-2">
              &middot; Due {format(new Date(dueDate), "MMM d")}
            </span>
          )}
        </p>
      </div>

      <div className="flex-shrink-0">
        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
      </div>
    </Link>
  );
}
