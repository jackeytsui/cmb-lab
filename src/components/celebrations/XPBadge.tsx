"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

interface XPBadgeProps {
  xpEarned: number;
}

export function XPBadge({ xpEarned }: XPBadgeProps) {
  return (
    <motion.div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-500/50 px-4 py-2">
      <Trophy className="h-5 w-5 text-amber-400" />
      <span className="text-amber-300 font-semibold">+{xpEarned} XP</span>
    </motion.div>
  );
}
