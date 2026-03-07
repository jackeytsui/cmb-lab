"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface DailyGoalProgressProps {
  currentXP: number;
  goalXP: number;
  goalMet: boolean;
  className?: string;
}

// ============================================================
// Sub-components
// ============================================================

/** Simple checkmark SVG icon */
function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="text-emerald-400"
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================
// Component
// ============================================================

export function DailyGoalProgress({
  currentXP,
  goalXP,
  goalMet,
  className,
}: DailyGoalProgressProps) {
  // Cap visual progress at 100% but allow text to show overflow
  const percentage = goalXP > 0 ? Math.min((currentXP / goalXP) * 100, 100) : 0;
  const displayPercentage = goalXP > 0 ? Math.round((currentXP / goalXP) * 100) : 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">
          Today&apos;s Goal
        </span>
        <div className="flex items-center gap-1.5">
          {goalMet && <CheckIcon />}
          <span
            className={cn(
              "text-xs font-medium",
              goalMet ? "text-emerald-400" : "text-zinc-400"
            )}
          >
            {goalMet ? "Goal met!" : `${displayPercentage}%`}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-700">
        <motion.div
          className={cn(
            "h-full rounded-full",
            goalMet ? "bg-emerald-500" : "bg-blue-500"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>

      {/* XP numbers */}
      <p className="text-xs text-zinc-500">
        {currentXP.toLocaleString()} / {goalXP.toLocaleString()} XP
      </p>
    </div>
  );
}
