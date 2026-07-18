import type { CsmHealthBand, CsmTrend } from "@/db/schema";
import type { CustomerSignals, HealthFactor, HealthResult } from "./types";

// ============================================================
// Health scoring engine (PURE — no DB, no server-only).
//
// A weighted, multi-factor, explainable customer-health model. Design choices
// are grounded in current best practice (Gainsight scorecards, ChurnZero,
// EdTech early-warning research):
//
//  - Few, high-signal factors (6) rather than dozens of noisy inputs.
//  - Aggressive time-decay on engagement: ~7 days of silence halves the
//    recency subscore, because inactivity is the earliest churn signal.
//  - Relative velocity: this-period vs last-period lesson completion, so a
//    power user who suddenly slows down is caught even while still "active".
//  - Not-applicable factors (e.g. no assigned coach) are excluded and their
//    weight is redistributed, so customers aren't punished for missing context.
//  - Every subscore ships with a plain-language reason → the score is always
//    explainable ("why is this student red?").
//
// This module is deliberately IO-free so it is trivially unit-testable and
// reusable for students, B2B seats, or partner businesses. The loaders that
// gather a CustomerSignals struct from the LMS + CRM live in health.ts.
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;

/** Base weights. Must sum to 1.0. Redistributed when a factor is N/A. */
const WEIGHTS = {
  engagement: 0.3,
  velocity: 0.2,
  consistency: 0.15,
  commercial: 0.15,
  coaching: 0.1,
  satisfaction: 0.1,
} as const;

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

const daysBetween = (later: Date, earlier: Date | null): number | null =>
  earlier ? Math.max(0, (later.getTime() - earlier.getTime()) / DAY_MS) : null;

/**
 * Exponential recency decay. Returns 100 for "just now" and halves every
 * `halfLifeDays`. e.g. halfLife=7 → 7d:50, 14d:25, 21d:12.5.
 */
function recencyScore(daysSince: number | null, halfLifeDays: number): number {
  if (daysSince === null) return 0;
  return clamp(100 * Math.pow(0.5, daysSince / halfLifeDays));
}

// ------------------------------------------------------------
// Individual factor scorers. Each returns a HealthFactor (score 0-100).
// ------------------------------------------------------------

function scoreEngagement(s: CustomerSignals): HealthFactor {
  const days = daysBetween(s.now, s.lastActivityAt);
  const score = recencyScore(days, 7);
  const detail =
    days === null
      ? "No recorded activity yet."
      : `Last active ${Math.round(days)} day(s) ago.`;
  return {
    key: "engagement",
    label: "Engagement recency",
    score,
    weight: WEIGHTS.engagement,
    weighted: 0,
    detail,
  };
}

function scoreVelocity(s: CustomerSignals): HealthFactor {
  // Saturating base: ~8 lessons in 30d is a strong pace → 100.
  const base = clamp(Math.sqrt(s.lessonsCompletedLast30 / 8) * 100);
  // Relative modifier: reward acceleration, penalise deceleration.
  const prev = s.lessonsCompletedPrev30;
  let modifier = 0;
  if (prev > 0) {
    const ratio = s.lessonsCompletedLast30 / prev;
    if (ratio >= 1.1) modifier = 10;
    else if (ratio <= 0.5) modifier = -25;
    else if (ratio < 0.9) modifier = -12;
  } else if (s.lessonsCompletedLast30 === 0) {
    modifier = -10; // no progress this period or last
  }
  const score = clamp(base + modifier);
  const detail = `${s.lessonsCompletedLast30} lesson(s) in 30d (prev ${prev}).`;
  return {
    key: "velocity",
    label: "Progress velocity",
    score,
    weight: WEIGHTS.velocity,
    weighted: 0,
    detail,
  };
}

function scoreConsistency(s: CustomerSignals): HealthFactor {
  const base = clamp((s.activeDaysLast14 / 14) * 100);
  // Small habit bonus for a meaningful current streak.
  const streakBonus = clamp(Math.min(s.currentStreak, 7) * 2, 0, 14);
  const score = clamp(base + streakBonus);
  const detail = `${s.activeDaysLast14}/14 active days, ${s.currentStreak}-day streak.`;
  return {
    key: "consistency",
    label: "Consistency & habit",
    score,
    weight: WEIGHTS.consistency,
    weighted: 0,
    detail,
  };
}

function scoreCommercial(s: CustomerSignals): HealthFactor {
  const status = (s.paymentStatus ?? "").toLowerCase();
  let score: number;
  let detail: string;
  if (["failed", "declined", "past_due", "overdue", "unpaid"].includes(status)) {
    score = 10;
    detail = `Billing status: ${s.paymentStatus}.`;
  } else if (["paid", "active", "current"].includes(status)) {
    score = 100;
    detail = "Billing in good standing.";
  } else if (["trialing", "trial"].includes(status)) {
    score = 70;
    detail = "On trial — not yet converted.";
  } else {
    score = 70; // unknown — neutral, don't over-penalise
    detail = "Billing status unknown.";
  }
  // Renewal horizon: an imminent lapse with no recent activity is a red flag.
  const daysToRenewal = s.productEndDate
    ? (s.productEndDate.getTime() - s.now.getTime()) / DAY_MS
    : null;
  if (daysToRenewal !== null && daysToRenewal <= 21 && daysToRenewal >= 0) {
    score = clamp(score - 15);
    detail += ` Renews in ${Math.round(daysToRenewal)}d.`;
  }
  // Onboarding gate: enrolled >7d ago but never completed a first lesson.
  const accountAge = daysBetween(s.now, s.createdAt);
  if (!s.onboardingCompleted && accountAge !== null && accountAge > 7) {
    score = clamp(Math.min(score, 30));
    detail += " First lesson not completed.";
  }
  return {
    key: "commercial",
    label: "Commercial & onboarding",
    score,
    weight: WEIGHTS.commercial,
    weighted: 0,
    detail,
  };
}

function scoreCoaching(s: CustomerSignals): HealthFactor {
  if (!s.hasAssignedCoach) {
    return {
      key: "coaching",
      label: "Coaching cadence",
      score: 0,
      weight: 0,
      weighted: 0,
      detail: "No coach assigned — not scored.",
      notApplicable: true,
    };
  }
  const days = daysBetween(s.now, s.lastCoachingAt);
  // Coaching is monthly-ish; decay with a 30-day half-life.
  const score = s.lastCoachingAt ? recencyScore(days, 30) : 15;
  const detail = s.lastCoachingAt
    ? `Last coaching ${Math.round(days ?? 0)} day(s) ago.`
    : "Coach assigned but no session yet.";
  return {
    key: "coaching",
    label: "Coaching cadence",
    score,
    weight: WEIGHTS.coaching,
    weighted: 0,
    detail,
  };
}

function scoreSatisfaction(s: CustomerSignals): HealthFactor {
  const ratings: number[] = [];
  if (s.avgCoachingRating != null) ratings.push(s.avgCoachingRating);
  if (s.satisfactionRating != null) ratings.push(s.satisfactionRating);
  if (ratings.length === 0) {
    return {
      key: "satisfaction",
      label: "Satisfaction",
      score: 0,
      weight: 0,
      weighted: 0,
      detail: "No satisfaction data — not scored.",
      notApplicable: true,
    };
  }
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length; // 1-5
  const score = clamp((avg / 5) * 100);
  return {
    key: "satisfaction",
    label: "Satisfaction",
    score,
    weight: WEIGHTS.satisfaction,
    weighted: 0,
    detail: `Average rating ${avg.toFixed(1)}/5.`,
  };
}

// ------------------------------------------------------------
// Composite scorer
// ------------------------------------------------------------

export function bandForScore(score: number): CsmHealthBand {
  if (score >= 80) return "thriving";
  if (score >= 60) return "healthy";
  if (score >= 40) return "watch";
  if (score >= 20) return "at_risk";
  return "critical";
}

function trendForDelta(delta: number | null): CsmTrend {
  if (delta === null) return "steady";
  if (delta >= 5) return "improving";
  if (delta <= -5) return "declining";
  return "steady";
}

/**
 * Score one customer. Pure — no DB access. `previousScore` (if known) drives
 * the trend classification.
 */
export function scoreHealth(
  signals: CustomerSignals,
  previousScore: number | null = null,
): HealthResult {
  const raw: HealthFactor[] = [
    scoreEngagement(signals),
    scoreVelocity(signals),
    scoreConsistency(signals),
    scoreCommercial(signals),
    scoreCoaching(signals),
    scoreSatisfaction(signals),
  ];

  // Redistribute the weight of not-applicable factors across the rest so the
  // composite always sums to a full 0-100 range.
  const applicable = raw.filter((f) => !f.notApplicable);
  const applicableWeight = applicable.reduce((sum, f) => sum + f.weight, 0) || 1;

  let composite = 0;
  const factors = raw.map((f) => {
    if (f.notApplicable) return { ...f, weighted: 0 };
    const effectiveWeight = f.weight / applicableWeight;
    const weighted = f.score * effectiveWeight;
    composite += weighted;
    return { ...f, weight: effectiveWeight, weighted };
  });

  const score = Math.round(clamp(composite));

  // Churn risk = inverse of health, amplified by acute red flags.
  let churnRisk = 100 - score;
  const status = (signals.paymentStatus ?? "").toLowerCase();
  if (["failed", "declined", "past_due", "overdue", "unpaid"].includes(status)) {
    churnRisk += 15;
  }
  const daysInactive = daysBetween(signals.now, signals.lastActivityAt);
  if (daysInactive !== null && daysInactive > 21) churnRisk += 10;
  if (!signals.onboardingCompleted) churnRisk += 5;
  churnRisk = Math.round(clamp(churnRisk));

  const delta = previousScore === null ? null : score - previousScore;

  return {
    score,
    band: bandForScore(score),
    trend: trendForDelta(delta),
    churnRisk,
    previousScore,
    factors,
    summary: buildSummary(score, factors),
  };
}

/** Compose a one-line narrative from the weakest contributing factors. */
function buildSummary(score: number, factors: HealthFactor[]): string {
  const band = bandForScore(score);
  const weakest = factors
    .filter((f) => !f.notApplicable)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  if (band === "thriving") {
    return `Thriving (${score}). Strong engagement and progress — a candidate for advocacy or expansion.`;
  }
  const reasons = weakest
    .filter((f) => f.score < 55)
    .map((f) => f.detail)
    .join(" ");
  const lead =
    band === "critical" || band === "at_risk"
      ? `At risk (${score}).`
      : `Needs attention (${score}).`;
  return reasons ? `${lead} ${reasons}` : `${lead} Monitor engagement trend.`;
}
