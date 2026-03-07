"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  getTierConfig,
  getScoreTier,
  CELEBRATION_TIMING,
  type CelebrationOverlayProps,
} from "@/lib/celebrations";
import { ScoreReveal } from "./ScoreReveal";
import { XPBadge } from "./XPBadge";
import { StreakBadge } from "./StreakBadge";
import { SmartCTAs } from "./SmartCTAs";

// ============================================================
// Animation Variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: CELEBRATION_TIMING.initialDelay,
      staggerChildren: CELEBRATION_TIMING.staggerInterval,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 20 },
  },
};

const reducedItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

// ============================================================
// Component
// ============================================================

export function CelebrationOverlay({
  type,
  score,
  xpEarned,
  streakCount,
  correctCount,
  totalExercises,
  nextLesson,
  nextAction,
  courseId,
  practiceSetId,
  onDismiss,
  onRetry,
}: CelebrationOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  const tier = getScoreTier(score);
  const config = getTierConfig(score);
  const itemVars = shouldReduceMotion ? reducedItemVariants : itemVariants;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      onClick={onDismiss}
    >
      <div
        className={`relative max-w-md w-full mx-4 p-8 rounded-2xl bg-zinc-900/95 border border-zinc-700/50 text-center space-y-4 ${
          tier === "perfect" ? config.glowClass : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Stage 1: Score count-up */}
        <motion.div variants={itemVars}>
          <ScoreReveal score={score} tier={tier} />
        </motion.div>

        {/* Stage 2: Tier message + practice stats */}
        <motion.div variants={itemVars}>
          <p className="text-zinc-300">{config.message}</p>
          {type === "practice" &&
            correctCount !== undefined &&
            totalExercises !== undefined && (
              <p className="text-zinc-400 text-sm mt-1">
                {correctCount}/{totalExercises} correct
              </p>
            )}
        </motion.div>

        {/* Stage 3: XP + streak badges */}
        <motion.div
          variants={itemVars}
          className="flex items-center justify-center gap-3"
        >
          <XPBadge xpEarned={xpEarned} />
          <StreakBadge streakCount={streakCount} />
        </motion.div>

        {/* Stage 4: Smart CTAs */}
        <motion.div variants={itemVars}>
          <SmartCTAs
            type={type}
            score={score}
            nextLesson={nextLesson}
            nextAction={nextAction}
            courseId={courseId}
            practiceSetId={practiceSetId}
            onDismiss={onDismiss}
            onRetry={onRetry}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
