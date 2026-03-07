// Celebration System — Score Tiers, Configs, and Timing Constants
//
// Provides the data layer for the celebration overlay:
// - Score tier classification (perfect/excellent/good/keep_practicing)
// - Visual config per tier (colors, labels, messages)
// - Animation timing constants for staggered reveal
// - CelebrationOverlayProps interface for component consumers

// ============================================================
// Types
// ============================================================

export type ScoreTier = "perfect" | "excellent" | "good" | "keep_practicing";

export interface TierConfig {
  tier: ScoreTier;
  label: string;
  message: string;
  /** Tailwind text color class */
  color: string;
  /** Tailwind bg + border classes */
  bgColor: string;
  /** Optional glow shadow class */
  glowClass: string;
}

// ============================================================
// Tier Configurations
// ============================================================

export const TIER_CONFIGS: Record<ScoreTier, TierConfig> = {
  perfect: {
    tier: "perfect",
    label: "Perfect!",
    message: "Flawless performance — you nailed every single one!",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20 border-yellow-500/50",
    glowClass: "shadow-[0_0_30px_rgba(234,179,8,0.3)]",
  },
  excellent: {
    tier: "excellent",
    label: "Excellent!",
    message: "Outstanding work — you really know your stuff!",
    color: "text-zinc-300",
    bgColor: "bg-zinc-400/20 border-zinc-400/50",
    glowClass: "",
  },
  good: {
    tier: "good",
    label: "Good Job!",
    message: "Solid effort — keep building on this momentum!",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20 border-blue-500/50",
    glowClass: "",
  },
  keep_practicing: {
    tier: "keep_practicing",
    label: "Keep Going!",
    message: "Every attempt makes you stronger — try again!",
    color: "text-zinc-400",
    bgColor: "bg-zinc-600/20 border-zinc-600/50",
    glowClass: "",
  },
};

// ============================================================
// Score Tier Classification
// ============================================================

/**
 * Classify a score (0-100) into a celebration tier.
 *
 * Thresholds:
 * - 95-100: perfect
 * - 80-94:  excellent
 * - 60-79:  good
 * - 0-59:   keep_practicing
 */
export function getScoreTier(score: number): ScoreTier {
  if (score >= 95) return "perfect";
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  return "keep_practicing";
}

/**
 * Get the full tier configuration for a given score.
 */
export function getTierConfig(score: number): TierConfig {
  return TIER_CONFIGS[getScoreTier(score)];
}

// ============================================================
// Animation Timing Constants
// ============================================================

/**
 * Timing constants for the CelebrationOverlay staggered reveal.
 *
 * The overlay has 4 visible motion.div children (stages):
 *   1. ScoreReveal (animated count-up)
 *   2. Tier message + optional practice stats
 *   3. XP + streak badges row
 *   4. SmartCTAs
 *
 * Confetti fires separately via setTimeout in the useCelebration hook
 * at confettiDelayMs — it is NOT a stagger child.
 */
export const CELEBRATION_TIMING = {
  /** Seconds before the first element animates in */
  initialDelay: 0.3,
  /** Seconds between each successive element */
  staggerInterval: 0.5,
  /** Number of visible DOM children in the stagger sequence */
  stages: 4,
  /** Milliseconds before confetti fires (coincides with tier message appearing) */
  confettiDelayMs: 1300,
  /** Total duration of the stagger sequence in seconds */
  get totalDuration() {
    return this.initialDelay + this.staggerInterval * (this.stages - 1);
  },
} as const;

// ============================================================
// Component Props Interface
// ============================================================

export interface CelebrationOverlayProps {
  type: "lesson" | "practice";
  /** Score as percentage 0-100 */
  score: number;
  /** XP earned from this session */
  xpEarned: number;
  /** Current streak count */
  streakCount: number;
  /** Whether this is the user's first attempt at this lesson/practice */
  isFirstAttempt: boolean;
  /** Number of correct answers (practice mode) */
  correctCount?: number;
  /** Total number of exercises (practice mode) */
  totalExercises?: number;
  /** Next lesson in module, or null if last lesson */
  nextLesson?: { id: string; title: string } | null;
  /** Course ID for navigation */
  courseId?: string;
  /** Practice set ID for retry navigation */
  practiceSetId?: string;
  /** Optional next action label and href for sequential flow */
  nextAction?: { label: string; href: string };
  /** Callback when overlay is dismissed */
  onDismiss: () => void;
  /** Callback for retry action */
  onRetry?: () => void;
}
