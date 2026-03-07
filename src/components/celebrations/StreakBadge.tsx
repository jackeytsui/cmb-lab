"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface StreakBadgeProps {
  streakCount: number;
}

export function StreakBadge({ streakCount }: StreakBadgeProps) {
  if (streakCount <= 0) return null;

  return (
    <motion.div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 border border-orange-500/50 px-4 py-2">
      <Flame className="h-5 w-5 text-orange-400" />
      <span className="text-orange-300 font-semibold">
        {streakCount} day streak
      </span>
    </motion.div>
  );
}
