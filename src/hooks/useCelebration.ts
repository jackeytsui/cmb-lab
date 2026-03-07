"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { getScoreTier, CELEBRATION_TIMING } from "@/lib/celebrations";
import { fireConfettiForTier } from "@/lib/confetti";

interface UseCelebrationProps {
  score: number;
}

export function useCelebration({ score }: UseCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hasFired = useRef<boolean>(false);
  const shouldReduceMotion = useReducedMotion();
  const tier = getScoreTier(score);

  const show = useCallback(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    setIsVisible(true);

    if (!shouldReduceMotion && tier !== "keep_practicing") {
      setTimeout(() => {
        fireConfettiForTier(tier);
      }, CELEBRATION_TIMING.confettiDelayMs);
    }
  }, [shouldReduceMotion, tier]);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    confetti.reset();
  }, []);

  const reset = useCallback(() => {
    hasFired.current = false;
    setIsVisible(false);
    confetti.reset();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      confetti.reset();
    };
  }, []);

  return { isVisible, show, dismiss, reset, tier, shouldReduceMotion };
}
