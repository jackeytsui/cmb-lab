// Confetti Presets — Visual Effects per Score Tier
//
// Each tier has a distinct confetti preset with appropriate particle count,
// colors, spread, and physics. All presets respect prefers-reduced-motion.
//
// Uses canvas-confetti library: https://github.com/catdad/canvas-confetti

import confetti from "canvas-confetti";
import type { ScoreTier } from "./celebrations";

// ============================================================
// Color Palettes
// ============================================================

const GOLD_COLORS = ["#FFD700", "#FFA500", "#FF8C00", "#FFEC8B", "#F0E68C"];
const SILVER_COLORS = ["#C0C0C0", "#A9A9A9", "#D3D3D3", "#E8E8E8", "#B8B8B8"];

// ============================================================
// Tier Presets
// ============================================================

/**
 * Perfect score (95-100%): Grand gold explosion with side bursts.
 * 150 star/circle particles + two delayed side bursts of 50 each.
 */
export function firePerfectConfetti(): void {
  // Main central burst
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
    zIndex: 9999,
  });

  // Delayed side bursts
  setTimeout(() => {
    // Left burst
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: GOLD_COLORS,
      disableForReducedMotion: true,
      zIndex: 9999,
    });
    // Right burst
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: GOLD_COLORS,
      disableForReducedMotion: true,
      zIndex: 9999,
    });
  }, 250);
}

/**
 * Excellent score (80-94%): Silver burst with circle/square particles.
 * 80 particles, moderate spread.
 */
export function fireExcellentConfetti(): void {
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
    zIndex: 9999,
  });
}

/**
 * Good score (60-79%): Gentle pastel confetti.
 * 30 particles, soft spread with quick decay.
 */
export function fireGoodConfetti(): void {
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
    zIndex: 9999,
  });
}

/**
 * Fire the appropriate confetti preset for a given score tier.
 * "keep_practicing" is a no-op (no confetti for scores below 60%).
 */
export function fireConfettiForTier(tier: ScoreTier): void {
  switch (tier) {
    case "perfect":
      firePerfectConfetti();
      break;
    case "excellent":
      fireExcellentConfetti();
      break;
    case "good":
      fireGoodConfetti();
      break;
    case "keep_practicing":
      // No confetti for low scores — keep it encouraging without overdoing it
      break;
  }
}

/**
 * Reset/clear any active confetti animation.
 * Useful for cleanup when unmounting the celebration overlay.
 */
export function resetConfetti(): void {
  confetti.reset();
}
