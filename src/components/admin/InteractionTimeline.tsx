"use client";

import { useCallback, useState } from "react";
import type { Interaction } from "@/db/schema/interactions";

export interface InteractionTimelineProps {
  /** List of interactions to display */
  interactions: Interaction[];
  /** Current video time in seconds */
  currentTime: number;
  /** Video duration in seconds */
  duration: number;
  /** Callback when interaction marker is clicked */
  onSelect: (interaction: Interaction) => void;
  /** Callback when empty area is clicked */
  onAddAtTime: (time: number) => void;
}

/**
 * Format seconds to MM:SS display
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Interactive timeline for managing interaction points.
 *
 * Features:
 * - Horizontal timeline bar
 * - Color-coded markers (cyan=text, purple=audio)
 * - Tooltip on hover showing prompt preview
 * - Click marker to edit, click empty to add
 * - Current time indicator
 */
export function InteractionTimeline({
  interactions,
  currentTime,
  duration,
  onSelect,
  onAddAtTime,
}: InteractionTimelineProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle clicks on the timeline itself, not on markers
    if ((e.target as HTMLElement).dataset.marker) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const selectedTime = Math.floor(percentage * duration);
    onAddAtTime(Math.max(0, Math.min(selectedTime, duration)));
  }, [duration, onAddAtTime]);

  const handleMarkerClick = useCallback((e: React.MouseEvent, interaction: Interaction) => {
    e.stopPropagation();
    onSelect(interaction);
  }, [onSelect]);

  if (duration === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-center text-zinc-400">
        Loading video duration...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">
          Interaction Timeline
        </h3>
        <span className="text-xs text-zinc-500">
          Click timeline to add, click marker to edit
        </span>
      </div>

      {/* Timeline bar */}
      <div
        className="relative h-12 cursor-crosshair rounded bg-zinc-900"
        onClick={handleTimelineClick}
      >
        {/* Time markers */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[10px] text-zinc-600">
          <span>0:00</span>
          <span>{formatTime(duration / 4)}</span>
          <span>{formatTime(duration / 2)}</span>
          <span>{formatTime((duration * 3) / 4)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Interaction markers */}
        {interactions.map((interaction) => {
          const position = (interaction.timestamp / duration) * 100;
          const isHovered = hoveredId === interaction.id;

          return (
            <div
              key={interaction.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position}%` }}
              onMouseEnter={() => setHoveredId(interaction.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Marker dot */}
              <button
                data-marker="true"
                onClick={(e) => handleMarkerClick(e, interaction)}
                className={`h-5 w-5 rounded-full border-2 border-white/30 transition-transform hover:scale-125 ${
                  interaction.type === "text"
                    ? "bg-cyan-500 hover:bg-cyan-400"
                    : "bg-purple-500 hover:bg-purple-400"
                }`}
                title={`${formatTime(interaction.timestamp)} - ${interaction.type}`}
              />

              {/* Tooltip on hover */}
              {isHovered && (
                <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-700 px-3 py-2 text-sm shadow-lg">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        interaction.type === "text" ? "bg-cyan-500" : "bg-purple-500"
                      }`}
                    />
                    <span className="font-medium text-white">
                      {formatTime(interaction.timestamp)}
                    </span>
                    <span className="text-zinc-400">
                      {interaction.type}
                    </span>
                  </div>
                  <p className="mt-1 max-w-xs truncate text-zinc-300">
                    {interaction.prompt}
                  </p>
                  {/* Arrow */}
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
                </div>
              )}
            </div>
          );
        })}

        {/* Current time indicator */}
        <div
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-indigo-500"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        >
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-cyan-500" />
          <span>Text</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-purple-500" />
          <span>Audio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-indigo-500" />
          <span>Current</span>
        </div>
        <span className="ml-auto">
          {interactions.length} interaction{interactions.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
