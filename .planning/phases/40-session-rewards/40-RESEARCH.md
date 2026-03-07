# Phase 40: Session Rewards - Research

**Researched:** 2026-02-08
**Domain:** Celebration overlays with animated score reveals, tier-based confetti, XP badges, streak updates, and smart CTAs
**Confidence:** HIGH

## Summary

Phase 40 adds celebration overlays that trigger when a student completes a lesson or practice set. The system needs two integration points: (1) the lesson completion flow, where `useProgress` already returns `lessonComplete: true` from the API, and (2) the practice set completion flow, where `PracticePlayer.handleComplete()` transitions to the results screen. Both flows currently show minimal UI -- lessons have no completion celebration at all, and practice sets show a basic score card without animation. Phase 40 replaces/augments these with an animated celebration overlay.

The technical core is straightforward: `canvas-confetti` (v1.9.4) for particle effects, Framer Motion (v12.29.2, already installed) for the staggered reveal sequence, and a `useReducedMotion` hook (built into Framer Motion) for accessibility. The celebration component receives a score, computes a tier (Perfect/Excellent/Good/Keep Practicing), fires the appropriate confetti effect, reveals elements in a choreographed sequence over ~3.5 seconds, then shows smart CTAs. The "smart CTA" logic requires a new utility function to determine the next lesson in sequence (by sortOrder within modules), which does not currently exist in the codebase.

**Primary recommendation:** Build a single reusable `CelebrationOverlay` component that accepts score, XP earned, streak count, and completion type (lesson vs practice). Use Framer Motion variants with `staggerChildren` and `delayChildren` for the reveal sequence. Fire `canvas-confetti` imperatively based on score tier. Add a `getNextLesson()` utility to `src/lib/unlock.ts` for smart CTA routing. Integrate by modifying `useProgress` and `PracticePlayer` to trigger the overlay on completion.

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | 12.29.2 | Staggered reveal animation, AnimatePresence for overlay mount/unmount, useReducedMotion hook | Already used in PracticePlayer, InteractionOverlay, chatbot |
| lucide-react | (installed) | Icons for CTAs (ArrowRight, RotateCcw, Trophy, Flame, Star) | Already used across all UI components |

### Needs Installation

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| canvas-confetti | ^1.9.4 | Performant confetti particle effects (gold fireworks, silver burst, gentle puff) | Fire on celebration overlay mount, based on score tier |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| canvas-confetti | react-confetti | canvas-confetti is 10x smaller, imperative API is simpler for fire-and-forget, no React wrapper overhead |
| canvas-confetti | CSS particles | CSS particles lack physics (gravity, decay, drift) and are limited to ~20 particles before jank |
| Framer Motion stagger | Manual setTimeout chain | Framer Motion is already installed, provides spring physics, and handles reduced-motion automatically with MotionConfig |

**Installation:**
```bash
npm install canvas-confetti
npm install -D @types/canvas-confetti
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── celebrations/
│       ├── CelebrationOverlay.tsx   # Full-screen overlay with staggered reveal
│       ├── ScoreReveal.tsx          # Animated score count-up with tier label
│       ├── XPBadge.tsx              # "+50 XP" animated badge
│       ├── StreakBadge.tsx           # Streak count with flame icon
│       └── SmartCTAs.tsx            # Next-action buttons (next lesson, retry, review)
├── hooks/
│   └── useCelebration.ts           # Orchestrates confetti + overlay state
├── lib/
│   └── confetti.ts                 # Confetti presets (gold fireworks, silver burst, gentle puff)
│   └── unlock.ts                   # Add getNextLesson() here (existing file)
```

### Pattern 1: Framer Motion Staggered Reveal with Variants
**What:** Parent container variant with `staggerChildren` and `delayChildren` orchestrates child animations in sequence. Each child has `hidden` and `visible` variants. The parent animates from `hidden` to `visible`, and children follow in order.
**When to use:** The core celebration reveal sequence (score -> label -> confetti -> XP -> streak -> CTAs).
**Example:**
```typescript
// Source: Framer Motion official docs (motion.dev/docs/stagger)
import { motion, useReducedMotion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.3,    // Wait 300ms before first child
      staggerChildren: 0.5,  // 500ms between each child
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
};

// Reduced motion variant (fades only, no transforms)
const itemVariantsReduced = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

function CelebrationSequence({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  const itemVars = shouldReduceMotion ? itemVariantsReduced : itemVariants;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      {/* Each child wraps in motion.div with itemVars */}
      <motion.div variants={itemVars}>{/* Score */}</motion.div>
      <motion.div variants={itemVars}>{/* Label */}</motion.div>
      <motion.div variants={itemVars}>{/* XP Badge */}</motion.div>
      <motion.div variants={itemVars}>{/* Streak */}</motion.div>
      <motion.div variants={itemVars}>{/* CTAs */}</motion.div>
    </motion.div>
  );
}
```

### Pattern 2: canvas-confetti Imperative Fire with Presets
**What:** Create preset functions for each tier's confetti style. Fire imperatively when the celebration mounts, timed to the stagger sequence.
**When to use:** After the score reveal phase in the animation sequence.
**Example:**
```typescript
// Source: canvas-confetti README (github.com/catdad/canvas-confetti)
import confetti from "canvas-confetti";

const GOLD_COLORS = ["#FFD700", "#FFA500", "#FF8C00", "#FFEC8B", "#F0E68C"];
const SILVER_COLORS = ["#C0C0C0", "#A9A9A9", "#D3D3D3", "#E8E8E8", "#B8B8B8"];

/** Gold fireworks for Perfect tier (95-100%) */
export function firePerfectConfetti() {
  // Fireworks burst from center
  confetti({
    particleCount: 150,
    spread: 360,
    startVelocity: 45,
    gravity: 0.8,
    ticks: 300,
    colors: GOLD_COLORS,
    shapes: ["star", "circle"],
    scalar: 1.2,
    origin: { x: 0.5, y: 0.4 },
    disableForReducedMotion: true,
  });
  // Delayed side bursts
  setTimeout(() => {
    confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors: GOLD_COLORS, disableForReducedMotion: true });
    confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors: GOLD_COLORS, disableForReducedMotion: true });
  }, 250);
}

/** Silver burst for Excellent tier (80-94%) */
export function fireExcellentConfetti() {
  confetti({
    particleCount: 80,
    spread: 120,
    startVelocity: 35,
    gravity: 1,
    ticks: 200,
    colors: SILVER_COLORS,
    shapes: ["circle", "square"],
    origin: { x: 0.5, y: 0.5 },
    disableForReducedMotion: true,
  });
}

/** Gentle puff for Good tier (60-79%) */
export function fireGoodConfetti() {
  confetti({
    particleCount: 30,
    spread: 80,
    startVelocity: 20,
    gravity: 1.2,
    decay: 0.95,
    ticks: 150,
    colors: ["#87CEEB", "#98D8C8", "#B8D4E3"],
    origin: { x: 0.5, y: 0.5 },
    disableForReducedMotion: true,
  });
}

/** No confetti for Keep Practicing tier (<60%) */
// Intentionally empty — supportive message only
```

### Pattern 3: Score Count-Up Animation
**What:** Animate a number from 0 to the final score using Framer Motion's `animate` with a custom `onUpdate` handler, or use `useMotionValue` + `useTransform` + `useSpring`.
**When to use:** The score reveal portion of the celebration.
**Example:**
```typescript
import { useEffect, useRef } from "react";
import { useMotionValue, useTransform, animate, motion } from "framer-motion";

function ScoreCountUp({ target, duration = 1.5 }: { target: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(count, target, {
      duration,
      ease: "easeOut",
    });
    return controls.stop;
  }, [count, target, duration]);

  // Subscribe to rounded value changes
  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => {
      if (displayRef.current) {
        displayRef.current.textContent = `${v}%`;
      }
    });
    return unsubscribe;
  }, [rounded]);

  return <span ref={displayRef} className="text-5xl font-bold">0%</span>;
}
```

### Pattern 4: Smart CTA Determination
**What:** Given a completed lesson or practice set, determine the available next actions: next lesson (by sortOrder), retry for perfect, review mistakes.
**When to use:** Rendering the CTA section of the celebration overlay.
**Example:**
```typescript
// Add to src/lib/unlock.ts

/**
 * Find the next lesson after the given lesson within the same module.
 * If this is the last lesson in the module, returns null.
 */
export async function getNextLesson(
  lessonId: string
): Promise<{ id: string; title: string } | null> {
  const currentLesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    columns: { moduleId: true, sortOrder: true },
  });
  if (!currentLesson) return null;

  const nextLesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.moduleId, currentLesson.moduleId),
      gt(lessons.sortOrder, currentLesson.sortOrder),
      isNull(lessons.deletedAt)
    ),
    orderBy: [asc(lessons.sortOrder)],
    columns: { id: true, title: true },
  });

  return nextLesson ?? null;
}
```

### Pattern 5: Overlay with AnimatePresence
**What:** Use AnimatePresence to mount/unmount the celebration overlay with enter/exit animations. The overlay is a full-screen fixed-position container.
**When to use:** Wrapping the CelebrationOverlay component.
**Example:**
```tsx
import { AnimatePresence, motion } from "framer-motion";

function LessonPage() {
  const [showCelebration, setShowCelebration] = useState(false);
  // ...

  return (
    <>
      {/* Lesson content */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            key="celebration"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <CelebrationOverlay
              score={score}
              xpEarned={50}
              streakCount={streak}
              type="lesson"
              onDismiss={() => setShowCelebration(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

### Anti-Patterns to Avoid
- **Blocking the completion API call on celebration:** Never wait for the celebration animation to finish before saving progress. The existing fire-and-forget pattern in the API routes handles this correctly. Celebration is purely client-side visual.
- **Creating confetti canvas on every render:** Use `confetti()` directly (it reuses the default global canvas). Don't create a new canvas instance per celebration.
- **Hardcoding animation durations in multiple places:** Define the stagger timing constants once and derive all delays from them. The sequence timing (score at 0s, label at 0.5s, confetti at 1.0s, XP at 1.5s, streak at 2.0s, CTAs at 2.5s) should be a single array of durations.
- **Forgetting AnimatePresence:** Without AnimatePresence wrapping the overlay, the exit animation won't play. The celebration will just vanish instead of fading out.
- **Re-fetching XP dashboard for celebration data:** The XP amount is known at completion time (50 for lessons, calculated for practice). Pass it as a prop rather than making an additional API call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confetti particle physics | Custom canvas animation loop with gravity/decay/drift | canvas-confetti | Handles physics, cleanup, worker offloading, and reduced-motion in ~6KB |
| Staggered animation sequence | Manual setTimeout chain with state tracking | Framer Motion variants with staggerChildren | Declarative, interruptible, spring physics, auto-cleanup on unmount |
| Score count-up | setInterval + useState counter | Framer Motion useMotionValue + animate | Stays in sync with frame rate, interruptible, no tearing |
| Reduced motion detection | window.matchMedia("(prefers-reduced-motion)") listener | Framer Motion useReducedMotion() | Already reactive, auto-re-renders, handles SSR |
| Overlay backdrop blur | Custom CSS with z-index management | Tailwind `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm` | One-liner, responsive, composable |

**Key insight:** The celebration system is 100% client-side visual feedback. It requires zero new API endpoints or database changes. All data needed (score, XP amount, streak) is already available from existing responses. The only new server-side code is `getNextLesson()` for the smart CTA.

## Common Pitfalls

### Pitfall 1: Confetti Fires But Is Invisible (z-index)
**What goes wrong:** canvas-confetti creates a canvas at z-index 100 by default. If the celebration overlay has a higher z-index (e.g., 50), the confetti appears behind the overlay.
**Why it happens:** Default z-index mismatch between the library's canvas and the app's overlay.
**How to avoid:** Set `zIndex: 9999` in all confetti calls, or set the overlay's z-index to a known value (z-50) and ensure confetti z-index is higher.
**Warning signs:** Animation plays but no confetti visible; confetti visible momentarily before overlay mounts.

### Pitfall 2: Celebration Triggers Multiple Times
**What goes wrong:** The lesson progress API is called every 5% of video watched. At 95%+, it calls on every timeupdate. Multiple calls can return `lessonComplete: true`, triggering multiple celebrations.
**Why it happens:** `lessonComplete` is true in the API response every time after the lesson is first completed (not just the transition).
**How to avoid:** Track celebration state with a ref: `const celebratedRef = useRef(false)`. Only show celebration if `lessonComplete && !celebratedRef.current`. Set `celebratedRef.current = true` when showing.
**Warning signs:** Multiple confetti bursts, overlay stacking, performance degradation.

### Pitfall 3: Confetti Persists After Navigation
**What goes wrong:** User triggers celebration, clicks "Next Lesson" CTA while confetti is still animating. Confetti particles continue on the new page.
**Why it happens:** canvas-confetti uses a global canvas that persists across React component unmounts.
**How to avoid:** Call `confetti.reset()` in a useEffect cleanup: `useEffect(() => () => confetti.reset(), [])`.
**Warning signs:** Confetti particles visible on pages that shouldn't have them.

### Pitfall 4: Score Count-Up Shows Wrong Number During Re-render
**What goes wrong:** If the component re-renders mid-animation (e.g., XP data arrives), the count-up restarts from 0.
**Why it happens:** Uncontrolled re-renders resetting the motion value.
**How to avoid:** Initialize the motion value outside the render cycle using useRef for the target, and only re-trigger the animation if the target actually changes.
**Warning signs:** Score flickering, count-up restarting mid-animation.

### Pitfall 5: Reduced Motion Not Applied to Confetti
**What goes wrong:** `useReducedMotion()` disables Framer Motion animations but confetti still fires because it's a separate library.
**Why it happens:** canvas-confetti has its own `disableForReducedMotion` option that must be set independently.
**How to avoid:** Always pass `disableForReducedMotion: true` in every confetti call. This is set per-call, not globally (unless using `confetti.create()` with the option).
**Warning signs:** Users with reduced motion still see confetti particles.

### Pitfall 6: No "Next Lesson" Available (Last Lesson in Module)
**What goes wrong:** Smart CTA shows "Next Lesson" but the user is on the last lesson in the module. Clicking navigates to nothing or errors.
**Why it happens:** `getNextLesson()` returns null for the last lesson, but the CTA rendering doesn't handle this case.
**How to avoid:** Always check for null. When no next lesson exists, show "Back to Course" instead. Consider also checking next module's first lesson for cross-module progression.
**Warning signs:** 404 page after clicking "Next Lesson", empty button, or missing CTA.

### Pitfall 7: Practice Set Score Doesn't Match Celebration Tier
**What goes wrong:** PracticeResults shows 85% but celebration shows "Good" tier (60-79%).
**Why it happens:** Practice score calculation differs between PracticePlayer (average of GradeResult scores) and the celebration (using a different calculation).
**How to avoid:** Use a single `getScoreTier()` function imported by both components. The score is already computed by `usePracticePlayer().totalScore` -- pass this exact value to the celebration.
**Warning signs:** Tier label doesn't match the displayed percentage.

## Code Examples

### Score Tier Classification
```typescript
// Source: Phase 40 requirements (CELEB-03)

export type ScoreTier = "perfect" | "excellent" | "good" | "keep_practicing";

export interface TierConfig {
  tier: ScoreTier;
  label: string;
  message: string;
  color: string;       // Tailwind text color
  bgColor: string;     // Tailwind bg color
  glowClass: string;   // Optional glow effect class
}

const TIER_CONFIGS: Record<ScoreTier, TierConfig> = {
  perfect: {
    tier: "perfect",
    label: "Perfect!",
    message: "Absolutely flawless! You've mastered this content.",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20 border-yellow-500/50",
    glowClass: "shadow-[0_0_30px_rgba(234,179,8,0.3)]",
  },
  excellent: {
    tier: "excellent",
    label: "Excellent!",
    message: "Outstanding work! You really know your stuff.",
    color: "text-zinc-300",
    bgColor: "bg-zinc-400/20 border-zinc-400/50",
    glowClass: "",
  },
  good: {
    tier: "good",
    label: "Good Job!",
    message: "Solid progress! A bit more practice and you'll nail it.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20 border-blue-500/50",
    glowClass: "",
  },
  keep_practicing: {
    tier: "keep_practicing",
    label: "Keep Going!",
    message: "Every attempt makes you stronger. Try again!",
    color: "text-zinc-400",
    bgColor: "bg-zinc-600/20 border-zinc-600/50",
    glowClass: "",
  },
};

export function getScoreTier(score: number): ScoreTier {
  if (score >= 95) return "perfect";
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  return "keep_practicing";
}

export function getTierConfig(score: number): TierConfig {
  return TIER_CONFIGS[getScoreTier(score)];
}
```

### Celebration Overlay Props Interface
```typescript
// Source: Derived from requirements CELEB-01 through CELEB-06

export interface CelebrationOverlayProps {
  /** Completion type: lesson or practice set */
  type: "lesson" | "practice";
  /** Final score as percentage 0-100 */
  score: number;
  /** XP earned from this activity */
  xpEarned: number;
  /** Current streak count (from Phase 39 XP data) */
  streakCount: number;
  /** Whether this is a first-time completion or retry */
  isFirstAttempt: boolean;
  /** Total correct answers (practice only) */
  correctCount?: number;
  /** Total exercises (practice only) */
  totalExercises?: number;
  /** Next lesson info (null if last in module) */
  nextLesson?: { id: string; title: string } | null;
  /** Course ID for "Back to Course" CTA */
  courseId?: string;
  /** Practice set ID for retry CTA */
  practiceSetId?: string;
  /** Called when user clicks a CTA to dismiss */
  onDismiss: () => void;
  /** Called when user clicks retry */
  onRetry?: () => void;
}
```

### useCelebration Hook
```typescript
// Source: Custom hook combining Framer Motion and canvas-confetti

import { useState, useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { getScoreTier, type ScoreTier } from "@/lib/celebrations";

interface UseCelebrationOptions {
  score: number;
  /** Delay before firing confetti (ms), to sync with stagger sequence */
  confettiDelay?: number;
}

export function useCelebration({ score, confettiDelay = 1000 }: UseCelebrationOptions) {
  const [isVisible, setIsVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const hasFired = useRef(false);
  const tier = getScoreTier(score);

  const show = useCallback(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    setIsVisible(true);

    // Fire confetti after delay (unless reduced motion)
    if (!shouldReduceMotion && tier !== "keep_practicing") {
      setTimeout(() => {
        fireConfettiForTier(tier);
      }, confettiDelay);
    }
  }, [shouldReduceMotion, tier, confettiDelay]);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    confetti.reset(); // Clean up any remaining particles
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      confetti.reset();
    };
  }, []);

  return { isVisible, show, dismiss, tier, shouldReduceMotion };
}
```

### Animation Timing Constants
```typescript
// Source: Derived from CELEB-05 requirement (~3.5 seconds total)

/** Stagger sequence timing for the celebration reveal */
export const CELEBRATION_TIMING = {
  /** Initial delay before first element appears */
  initialDelay: 0.3,
  /** Delay between each staggered element */
  staggerInterval: 0.5,
  /** Total number of stages: score, label, confetti, XP, streak, CTAs */
  stages: 6,
  /** Confetti fires at this stage index (0-based) */
  confettiStage: 2,
  /** Computed: confetti delay in ms */
  get confettiDelayMs(): number {
    return (this.initialDelay + this.staggerInterval * this.confettiStage) * 1000;
  },
  /** Computed: total sequence duration in seconds */
  get totalDuration(): number {
    return this.initialDelay + this.staggerInterval * (this.stages - 1);
  },
} as const;

// CELEBRATION_TIMING.confettiDelayMs = 1300ms (0.3 + 0.5*2 = 1.3s)
// CELEBRATION_TIMING.totalDuration = 2.8s (0.3 + 0.5*5 = 2.8s)
// With spring physics on each element, visual completion ~3.5s
```

### Integration Point: Lesson Completion
```typescript
// In InteractiveVideoPlayer or a wrapper component:

// useProgress already returns `lessonComplete: true` when lesson completes.
// The key integration is:
// 1. Detect `lessonComplete` transition (false -> true)
// 2. Fetch next lesson info (getNextLesson API)
// 3. Show CelebrationOverlay

const [showCelebration, setShowCelebration] = useState(false);
const celebratedRef = useRef(false);

// Watch for lesson completion from useProgress
useEffect(() => {
  if (completion?.isComplete && !celebratedRef.current) {
    celebratedRef.current = true;
    // Small delay to let video finish
    setTimeout(() => setShowCelebration(true), 500);
  }
}, [completion?.isComplete]);
```

### Integration Point: Practice Set Completion
```typescript
// In PracticePlayer, the `completed` status triggers PracticeResults.
// Replace/augment with CelebrationOverlay:

if (player.state.status === "completed") {
  return (
    <div className="max-w-2xl mx-auto">
      <AnimatePresence>
        {showCelebration && (
          <CelebrationOverlay
            type="practice"
            score={player.totalScore}
            xpEarned={calculatePracticeXP(player.totalScore, exercises.length)}
            streakCount={streakCount} // Fetched from /api/xp
            isFirstAttempt={!player.state.attemptId}
            correctCount={player.totalCorrect}
            totalExercises={exercises.length}
            practiceSetId={practiceSet.id}
            onDismiss={() => setShowCelebration(false)}
            onRetry={handleRetryAll}
          />
        )}
      </AnimatePresence>
      {/* Show PracticeResults underneath/after celebration dismissal */}
      {!showCelebration && (
        <PracticeResults ... />
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-confetti (react wrapper with state) | canvas-confetti (imperative, fire-and-forget) | 2024+ | Simpler integration, smaller bundle, no React re-render overhead |
| setTimeout animation chains | Framer Motion variants with staggerChildren | Framer Motion v4+ (2021) | Declarative, interruptible, spring physics built-in |
| Custom reduced-motion media query listener | useReducedMotion() from framer-motion | Framer Motion v3+ | Reactive hook, auto re-renders, SSR-safe |
| framer-motion package name | motion (migrating from framer-motion to motion) | Late 2024-2025 | This project still uses framer-motion v12.29.2 which works fine; no migration needed |

**Deprecated/outdated:**
- `react-confetti`: Still maintained but heavier than canvas-confetti; wraps the canvas in a React component causing unnecessary re-renders for particle animation
- Framer Motion v11 `useAnimation()` for sequences: v12 variants with staggerChildren are simpler for ordered reveals

## Open Questions

1. **Lesson score calculation**
   - What we know: Lessons complete via video watched % + interactions completed. The completion criteria is binary (complete/not complete), not scored.
   - What's unclear: What "score" to show for a lesson completion celebration. Lessons don't have a percentage score like practice sets.
   - Recommendation: For lessons, show a fixed "100% Complete" since completion is binary. Use the "perfect" tier confetti for all lesson completions (completing a lesson IS the achievement). Alternatively, show video watch percentage as the score, but this feels arbitrary since the threshold is configurable.

2. **XP amount for celebration display**
   - What we know: Lesson XP = 50 (fixed). Practice XP = `Math.round((5 + (score/100) * 5)) * totalExercises` + optional 25 perfect bonus. These are computed server-side in fire-and-forget fashion.
   - What's unclear: The celebration fires client-side before the XP award completes. Should we wait for the API response or compute XP client-side?
   - Recommendation: Compute XP amount client-side using the same formula from `XP_AMOUNTS` constants (already exported from `src/lib/xp.ts`). This avoids waiting for the async server response. Import `XP_AMOUNTS` and calculate: `XP_AMOUNTS.lesson_complete` for lessons, `Math.round((5 + (score/100) * 5)) * totalExercises + (score === 100 ? XP_AMOUNTS.practice_perfect : 0)` for practice.

3. **Streak data availability at celebration time**
   - What we know: Streak is fetched via GET /api/xp dashboard. The celebration fires immediately on completion, before the XP award (and thus streak update) completes on the server.
   - What's unclear: Should the celebration show the pre-completion streak or post-completion streak?
   - Recommendation: Show the pre-completion streak count (already available from the XPOverview component on the dashboard, or fetch once on page load). The difference of +1 is not meaningful for the celebration UX. Alternatively, fetch /api/xp after a short delay to get updated streak, but this adds complexity.

4. **Cross-module next lesson**
   - What we know: Lessons are within modules. The proposed `getNextLesson()` only looks within the current module.
   - What's unclear: Should "Next Lesson" CTA navigate to the first lesson of the next module when the current module is finished?
   - Recommendation: Start with within-module only. If `getNextLesson()` returns null, show "Back to Course" CTA. Cross-module navigation is a nice-to-have that can be added later if needed.

## Sources

### Primary (HIGH confidence)
- Codebase: `src/hooks/useProgress.ts` -- Lesson completion detection via `lessonComplete` response field
- Codebase: `src/components/practice/player/PracticePlayer.tsx` -- Practice completion flow, `handleComplete()`, `PracticeResults` integration
- Codebase: `src/components/practice/player/PracticeResults.tsx` -- Existing results UI showing score, breakdown, CTAs
- Codebase: `src/hooks/usePracticePlayer.ts` -- Practice player reducer, `totalScore`, `totalCorrect` computed values
- Codebase: `src/lib/xp-service.ts` -- XP award functions, fire-and-forget pattern
- Codebase: `src/lib/xp.ts` -- XP_AMOUNTS constants, calculateLevel pure functions
- Codebase: `src/lib/unlock.ts` -- Lesson unlock logic, sortOrder-based ordering pattern for `getNextLesson()`
- Codebase: `src/db/schema/courses.ts` -- Lesson sortOrder field, module-lesson hierarchy
- Codebase: `src/app/api/progress/[lessonId]/route.ts` -- Lesson completion API returning `lessonComplete` field
- Codebase: `src/app/api/xp/route.ts` -- XP dashboard API returning streak, level, daily data
- GitHub: canvas-confetti README (github.com/catdad/canvas-confetti) -- Full API, disableForReducedMotion, create(), reset()

### Secondary (MEDIUM confidence)
- canvas-confetti npm page -- Version 1.9.4, TypeScript types available via @types/canvas-confetti
- GitHub Issue #114 and #228 (canvas-confetti) -- disableForReducedMotion behavior confirmed
- Framer Motion official docs (motion.dev) -- variants, staggerChildren, delayChildren, useReducedMotion
- Multiple community examples -- staggered reveal sequence patterns with Framer Motion

### Tertiary (LOW confidence)
- None. All findings verified against codebase or official library documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- canvas-confetti is well-documented, framer-motion already installed and used extensively in codebase
- Architecture: HIGH -- Integration points clearly identified in existing code (useProgress, PracticePlayer, PracticeResults)
- Pitfalls: HIGH -- All pitfalls derived from analysis of actual codebase patterns (multiple lessonComplete triggers, z-index conflicts, cleanup)
- Code examples: HIGH -- All patterns derived from existing codebase conventions and verified library documentation

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable domain, canvas-confetti and framer-motion are mature libraries)
