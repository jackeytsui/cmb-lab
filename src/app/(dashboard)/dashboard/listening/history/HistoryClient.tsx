"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Play, Clock } from "lucide-react";
import type { WatchHistoryEntry } from "@/lib/video-history";

interface HistoryClientProps {
  entries: WatchHistoryEntry[];
}

/**
 * Client component that renders the watch history grid.
 * Each card shows thumbnail, title, completion bar, and relative timestamp.
 */
export function HistoryClient({ entries }: HistoryClientProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground/90">
          No videos watched yet
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Start by pasting a YouTube URL in the{" "}
          <Link
            href="/dashboard/listening"
            className="text-emerald-500 hover:text-emerald-400 underline"
          >
            Listening Lab
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map((entry) => (
        <Link
          key={entry.id}
          href={`/dashboard/listening?videoId=${entry.youtubeVideoId}`}
          className="group block rounded-lg border border-border bg-card/70 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video overflow-hidden rounded-t-lg">
            <img
              src={`https://i.ytimg.com/vi/${entry.youtubeVideoId}/mqdefault.jpg`}
              alt={entry.title ?? "Video thumbnail"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
            {/* Play overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <Play className="h-10 w-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Card body */}
          <div className="p-4 space-y-3">
            {/* Title */}
            <h3 className="font-medium text-foreground line-clamp-2 leading-snug">
              {entry.title ?? "Untitled Video"}
            </h3>

            {/* Completion bar */}
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, entry.completionPercent)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.completionPercent}% complete
              </p>
            </div>

            {/* Last watched */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {formatDistanceToNow(new Date(entry.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
