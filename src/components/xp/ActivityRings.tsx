"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface RingData {
  label: string; // "Learn" | "Practice" | "Speak"
  current: number; // today's count (e.g., 1 lesson, 3 exercises, 0 conversations)
  goal: number; // target (e.g., 1, 5, 1)
  color: string; // hex color
}

interface ActivityRingsProps {
  rings: RingData[];
  size?: number; // default 140
  className?: string;
}

// ============================================================
// Constants
// ============================================================

const STROKE_WIDTH = 10;
const RING_GAP = 4;

/** Default ring colors matching the XP system design */
export const RING_COLORS = {
  learn: "#10b981", // emerald
  practice: "#3b82f6", // blue
  speak: "#f59e0b", // amber
} as const;

// ============================================================
// Component
// ============================================================

export function ActivityRings({
  rings,
  size = 140,
  className,
}: ActivityRingsProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const center = size / 2;
  // Outermost ring radius: leave room for stroke
  const outerRadius = center - STROKE_WIDTH / 2;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* SVG Rings */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {rings.map((ring, index) => {
          const radius = outerRadius - index * (STROKE_WIDTH + RING_GAP);
          const circumference = 2 * Math.PI * radius;
          const progress = ring.goal > 0 ? Math.min(ring.current / ring.goal, 1) : 0;
          const dashOffset = circumference * (1 - progress);

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={STROKE_WIDTH}
                opacity={0.2}
              />
              {/* Animated progress arc */}
              <motion.circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{
                  duration: reducedMotion ? 0 : 1.5,
                  ease: "easeOut",
                }}
                transform={`rotate(-90 ${center} ${center})`}
              />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4">
        {rings.map((ring) => (
          <div key={ring.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ring.color }}
            />
            <span className="text-xs text-zinc-400">{ring.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
