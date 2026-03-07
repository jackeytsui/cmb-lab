"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  freezesRemaining: number;
  freezesUsedThisMonth: number;
  className?: string;
}

// ============================================================
// Sub-components
// ============================================================

/** Animated counter that counts up from 0 to target value */
function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || value === 0) return;

    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) {
        setDisplay(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [isInView, value]);

  return <span ref={ref}>{display}</span>;
}

/** SVG flame icon */
function FlameIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "shrink-0",
        active ? "text-orange-500" : "text-zinc-600"
      )}
    >
      <path
        d="M12 2c.5 3-1.5 5-1.5 5s2 1.5 2.5 4c.5 2.5-1 4.5-1 4.5s2-1 2.5-3c1 3-1 5.5-3.5 6.5C8.5 20 6 18 6 15c0-2 1-3.5 2-5 1-1.5 1.5-4 1.5-4s1 2.5 2.5 3c-.5-2.5 0-5 0-7Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Snowflake/shield freeze indicator */
function FreezeIndicator({ available }: { available: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "shrink-0",
        available ? "text-sky-400" : "text-zinc-700"
      )}
    >
      <path
        d="M12 2v4m0 12v4m-6-10H2m20 0h-4M7.05 7.05 4.93 4.93m14.14 14.14-2.12-2.12M7.05 16.95l-2.12 2.12M19.07 4.93l-2.12 2.12M12 8a4 4 0 100 8 4 4 0 000-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {available && (
        <circle cx="12" cy="12" r="3" fill="currentColor" opacity={0.4} />
      )}
    </svg>
  );
}

// ============================================================
// Component
// ============================================================

const MAX_FREEZES_PER_MONTH = 2;

export function StreakDisplay({
  currentStreak,
  longestStreak,
  freezesRemaining,
  className,
}: StreakDisplayProps) {
  const isActive = currentStreak > 0;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Flame + count */}
      <div className="flex items-center gap-2">
        <FlameIcon active={isActive} />
        <span
          className={cn(
            "text-3xl font-bold tabular-nums",
            isActive ? "text-orange-400" : "text-zinc-600"
          )}
        >
          {isActive ? <AnimatedCount value={currentStreak} /> : 0}
        </span>
      </div>

      {/* Label */}
      <p
        className={cn(
          "text-sm",
          isActive ? "text-zinc-300" : "text-zinc-500"
        )}
      >
        {isActive ? "day streak" : "Start your streak today!"}
      </p>

      {/* Longest streak */}
      <p className="text-xs text-zinc-500">
        Best: {longestStreak} {longestStreak === 1 ? "day" : "days"}
      </p>

      {/* Freeze indicators */}
      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-zinc-500">
          Freezes
        </span>
        {Array.from({ length: MAX_FREEZES_PER_MONTH }).map((_, i) => (
          <FreezeIndicator key={i} available={i < freezesRemaining} />
        ))}
      </div>
    </div>
  );
}
