"use client";

/**
 * CuePointMarkers Component
 *
 * Visual markers on the video progress bar indicating interaction points.
 * Shows yellow markers for pending interactions and green for completed ones.
 */

import type { CuePoint } from "@/types/video";

/**
 * Props for the CuePointMarkers component.
 */
export interface CuePointMarkersProps {
  /** Array of cue points with timestamps and completion status */
  cuePoints: CuePoint[];
  /** Total video duration in seconds */
  duration: number;
}

/**
 * Cue point markers overlay for video progress bar.
 *
 * Positions markers based on their timestamp relative to video duration.
 * Uses colored indicators to show interaction completion status.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <VideoPlayer />
 *   <CuePointMarkers cuePoints={cuePoints} duration={120} />
 * </div>
 * ```
 */
export function CuePointMarkers({ cuePoints, duration }: CuePointMarkersProps) {
  if (duration === 0) return null;

  return (
    <div className="absolute inset-x-0 bottom-12 h-1 pointer-events-none">
      {cuePoints.map((cp) => {
        const position = (cp.timestamp / duration) * 100;
        return (
          <div
            key={cp.id}
            className={`absolute w-2 h-2 -top-0.5 rounded-full transform -translate-x-1/2 ${
              cp.completed
                ? "bg-green-500 shadow-green-500/50"
                : "bg-yellow-500 shadow-yellow-500/50"
            } shadow-md`}
            style={{ left: `${position}%` }}
            title={`Interaction at ${Math.floor(cp.timestamp)}s${
              cp.completed ? " (completed)" : ""
            }`}
          />
        );
      })}
    </div>
  );
}
