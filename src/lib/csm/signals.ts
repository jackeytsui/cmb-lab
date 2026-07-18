import type { CustomerSignals, DerivedSignal, HealthResult } from "./types";

// ============================================================
// Signal engine
//
// Turns a CustomerSignals struct + computed health into a set of discrete,
// workable risk/opportunity signals. Each carries a stable `dedupeKey` so the
// persistence layer upserts (refreshes) an ongoing condition instead of
// creating a new row every run. Severity drives triage ordering and which
// playbooks fire.
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;

const daysSince = (now: Date, then: Date | null): number | null =>
  then ? Math.max(0, (now.getTime() - then.getTime()) / DAY_MS) : null;

export function deriveSignals(
  s: CustomerSignals,
  health: HealthResult,
): DerivedSignal[] {
  const signals: DerivedSignal[] = [];
  const inactiveDays = daysSince(s.now, s.lastActivityAt);
  const accountAge = daysSince(s.now, s.createdAt);
  const status = (s.paymentStatus ?? "").toLowerCase();

  // --- Onboarding stall (highest-leverage churn lever: first value) ---
  if (!s.onboardingCompleted && accountAge !== null && accountAge > 7) {
    signals.push({
      type: "onboarding_stall",
      severity: accountAge > 21 ? "critical" : "high",
      title: "Onboarding stalled — no first lesson completed",
      detail: `Enrolled ${Math.round(accountAge)} days ago but has not completed a first lesson.`,
      dedupeKey: `onboarding_stall:${s.userId}`,
      data: { accountAgeDays: Math.round(accountAge) },
    });
  }

  // --- Inactivity (aggressive early-warning threshold) ---
  if (inactiveDays !== null && inactiveDays >= 7 && s.onboardingCompleted) {
    signals.push({
      type: "inactivity",
      severity:
        inactiveDays >= 21 ? "critical" : inactiveDays >= 14 ? "high" : "medium",
      title: `Inactive for ${Math.round(inactiveDays)} days`,
      detail: `No lesson or feature activity in ${Math.round(inactiveDays)} days.`,
      dedupeKey: `inactivity:${s.userId}`,
      data: { inactiveDays: Math.round(inactiveDays) },
    });
  }

  // --- Stalled progress (relative slowdown from an active baseline) ---
  if (
    s.lessonsCompletedLast30 === 0 &&
    s.lessonsCompletedPrev30 > 0 &&
    (inactiveDays === null || inactiveDays < 14)
  ) {
    signals.push({
      type: "stalled_progress",
      severity: "high",
      title: "Progress stalled",
      detail: `Completed ${s.lessonsCompletedPrev30} lesson(s) the prior month but 0 in the last 30 days.`,
      dedupeKey: `stalled_progress:${s.userId}`,
      data: { prev30: s.lessonsCompletedPrev30 },
    });
  }

  // --- Low satisfaction ---
  const ratings = [s.avgCoachingRating, s.satisfactionRating].filter(
    (r): r is number => r != null,
  );
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg < 3) {
      signals.push({
        type: "low_satisfaction",
        severity: avg < 2 ? "critical" : "high",
        title: "Low satisfaction rating",
        detail: `Average satisfaction ${avg.toFixed(1)}/5.`,
        dedupeKey: `low_satisfaction:${s.userId}`,
        data: { avgRating: Number(avg.toFixed(2)) },
      });
    }
  }

  // --- Coaching gap ---
  if (s.hasAssignedCoach) {
    const coachDays = daysSince(s.now, s.lastCoachingAt);
    if (coachDays === null || coachDays > 45) {
      signals.push({
        type: "coaching_gap",
        severity: coachDays === null ? "medium" : "low",
        title: "Coaching cadence gap",
        detail:
          coachDays === null
            ? "Coach assigned but no coaching session recorded yet."
            : `No coaching session in ${Math.round(coachDays)} days.`,
        dedupeKey: `coaching_gap:${s.userId}`,
        data: { coachDays: coachDays === null ? null : Math.round(coachDays) },
      });
    }
  }

  // --- Streak broken ---
  if (s.longestStreak >= 7 && s.currentStreak === 0 && s.activeDaysLast14 <= 2) {
    signals.push({
      type: "streak_broken",
      severity: "low",
      title: "Lost a strong streak",
      detail: `Previously reached a ${s.longestStreak}-day streak but has lapsed.`,
      dedupeKey: `streak_broken:${s.userId}`,
      data: { longestStreak: s.longestStreak },
    });
  }

  // --- Payment risk ---
  if (["failed", "declined", "past_due", "overdue", "unpaid"].includes(status)) {
    signals.push({
      type: "payment_risk",
      severity: "critical",
      title: "Payment at risk",
      detail: `Billing status is "${s.paymentStatus}".`,
      dedupeKey: `payment_risk:${s.userId}`,
      data: { paymentStatus: s.paymentStatus },
    });
  }

  // --- Renewal upcoming ---
  if (s.productEndDate) {
    const toRenewal = (s.productEndDate.getTime() - s.now.getTime()) / DAY_MS;
    if (toRenewal >= 0 && toRenewal <= 21) {
      signals.push({
        type: "renewal_upcoming",
        severity: health.band === "at_risk" || health.band === "critical" ? "high" : "info",
        title: `Renewal in ${Math.round(toRenewal)} days`,
        detail: `Plan lapses on ${s.productEndDate.toISOString().slice(0, 10)}.`,
        dedupeKey: `renewal_upcoming:${s.userId}`,
        data: { daysToRenewal: Math.round(toRenewal) },
      });
    }
  }

  // --- Expansion signal (thriving power user) ---
  if (
    health.score >= 80 &&
    s.onboardingCompleted &&
    s.lessonsCompletedLast30 >= 4 &&
    (inactiveDays === null || inactiveDays <= 3)
  ) {
    signals.push({
      type: "expansion_signal",
      severity: "info",
      title: "Expansion / advocacy opportunity",
      detail:
        "Highly engaged and progressing fast — a strong candidate for an upsell, referral, or testimonial ask.",
      dedupeKey: `expansion_signal:${s.userId}`,
      data: { score: health.score, last30: s.lessonsCompletedLast30 },
    });
  }

  // --- Champion (advocacy) ---
  const satisfied = ratings.length > 0 && ratings.every((r) => r >= 4.5);
  if (health.score >= 85 && satisfied && s.longestStreak >= 14) {
    signals.push({
      type: "champion",
      severity: "info",
      title: "Champion detected",
      detail: "Top-tier engagement and satisfaction — nurture as a referral source.",
      dedupeKey: `champion:${s.userId}`,
      data: { score: health.score, longestStreak: s.longestStreak },
    });
  }

  return signals;
}
