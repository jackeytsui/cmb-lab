"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MAX_LEVEL } from "@/lib/xp";

// ============================================================
// Types
// ============================================================

interface LevelBadgeProps {
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  totalXP: number;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function LevelBadge({
  level,
  currentLevelXP,
  nextLevelXP,
  totalXP,
  className,
}: LevelBadgeProps) {
  const isMaxLevel = level >= MAX_LEVEL;
  const progress =
    isMaxLevel || nextLevelXP === 0
      ? 100
      : Math.min((currentLevelXP / nextLevelXP) * 100, 100);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Circular badge */}
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-500 bg-zinc-800 shadow-lg shadow-amber-500/10">
        <span className="text-2xl font-bold text-amber-400">{level}</span>
        <span className="absolute -bottom-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          LEVEL
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[160px]">
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
          <motion.div
            className="h-full rounded-full bg-amber-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </div>

        {/* Progress text */}
        <p className="mt-1.5 text-center text-xs text-zinc-400">
          {isMaxLevel ? (
            <span className="font-semibold text-amber-400">MAX LEVEL</span>
          ) : (
            <>
              {currentLevelXP.toLocaleString()} / {nextLevelXP.toLocaleString()}{" "}
              XP to Level {level + 1}
            </>
          )}
        </p>
      </div>

      {/* Total XP */}
      <p className="text-xs text-zinc-500">
        {totalXP.toLocaleString()} XP total
      </p>
    </div>
  );
}
