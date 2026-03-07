"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import { getTierConfig, type ScoreTier } from "@/lib/celebrations";

interface ScoreRevealProps {
  score: number;
  tier: ScoreTier;
}

export function ScoreReveal({ score, tier }: ScoreRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const count = useMotionValue(shouldReduceMotion ? score : 0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const scoreRef = useRef<HTMLSpanElement>(null);

  const config = getTierConfig(score);

  useEffect(() => {
    // Update textContent directly to avoid re-renders
    const unsubscribe = rounded.on("change", (latest) => {
      if (scoreRef.current) {
        scoreRef.current.textContent = `${latest}%`;
      }
    });

    if (!shouldReduceMotion) {
      const controls = animate(count, score, {
        duration: 1.5,
        ease: "easeOut",
      });
      return () => {
        unsubscribe();
        controls.stop();
      };
    }

    return unsubscribe;
  }, [count, rounded, score, shouldReduceMotion]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={
          tier === "perfect" ? config.glowClass : undefined
        }
      >
        <span
          ref={scoreRef}
          className="text-6xl font-bold text-white"
        >
          {shouldReduceMotion ? `${score}%` : "0%"}
        </span>
      </div>
      <motion.span className={`text-xl font-semibold ${config.color}`}>
        {config.label}
      </motion.span>
    </div>
  );
}
