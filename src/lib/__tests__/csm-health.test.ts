import { describe, it, expect } from "vitest";
import { scoreHealth, bandForScore } from "@/lib/csm/scoring";
import { deriveSignals } from "@/lib/csm/signals";
import { recommendNextBestActions } from "@/lib/csm/playbooks";
import type { CustomerSignals } from "@/lib/csm/types";

const NOW = new Date("2026-07-18T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

function base(overrides: Partial<CustomerSignals> = {}): CustomerSignals {
  return {
    userId: "u1",
    now: NOW,
    createdAt: daysAgo(120),
    lastActivityAt: daysAgo(1),
    lessonsCompleted: 40,
    lessonsCompletedLast30: 6,
    lessonsCompletedPrev30: 5,
    activeDaysLast14: 12,
    longestStreak: 30,
    currentStreak: 12,
    onboardingCompleted: true,
    hasAssignedCoach: true,
    lastCoachingAt: daysAgo(10),
    avgCoachingRating: 4.8,
    satisfactionRating: 5,
    paymentStatus: "paid",
    productEndDate: daysAgo(-200),
    ...overrides,
  };
}

describe("scoreHealth", () => {
  it("scores an engaged, paying, consistent customer as thriving", () => {
    const r = scoreHealth(base());
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.band).toBe("thriving");
    expect(r.churnRisk).toBeLessThan(25);
  });

  it("scores an inactive, non-onboarded customer as at-risk/critical", () => {
    const r = scoreHealth(
      base({
        lastActivityAt: daysAgo(40),
        lessonsCompleted: 0,
        lessonsCompletedLast30: 0,
        lessonsCompletedPrev30: 0,
        activeDaysLast14: 0,
        currentStreak: 0,
        onboardingCompleted: false,
        avgCoachingRating: null,
        satisfactionRating: null,
        lastCoachingAt: null,
      }),
    );
    expect(r.score).toBeLessThan(40);
    expect(["at_risk", "critical"]).toContain(r.band);
    expect(r.churnRisk).toBeGreaterThan(60);
  });

  it("penalises a relative slowdown even when still recently active", () => {
    const fast = scoreHealth(
      base({ lessonsCompletedLast30: 8, lessonsCompletedPrev30: 6 }),
    );
    const slowed = scoreHealth(
      base({ lessonsCompletedLast30: 1, lessonsCompletedPrev30: 8 }),
    );
    expect(slowed.score).toBeLessThan(fast.score);
  });

  it("redistributes weight when coaching + satisfaction are not applicable", () => {
    const r = scoreHealth(
      base({
        hasAssignedCoach: false,
        lastCoachingAt: null,
        avgCoachingRating: null,
        satisfactionRating: null,
      }),
    );
    const applicable = r.factors.filter((f) => !f.notApplicable);
    const totalWeight = applicable.reduce((s, f) => s + f.weight, 0);
    // Applicable weights must renormalise to ~1.0.
    expect(totalWeight).toBeCloseTo(1, 5);
    expect(r.factors.find((f) => f.key === "coaching")?.notApplicable).toBe(true);
  });

  it("classifies trend from the previous score", () => {
    expect(scoreHealth(base(), 40).trend).toBe("improving");
    expect(scoreHealth(base(), 100).trend).toBe("declining");
  });

  it("maps scores to bands at the documented thresholds", () => {
    expect(bandForScore(85)).toBe("thriving");
    expect(bandForScore(65)).toBe("healthy");
    expect(bandForScore(45)).toBe("watch");
    expect(bandForScore(25)).toBe("at_risk");
    expect(bandForScore(10)).toBe("critical");
  });
});

describe("deriveSignals", () => {
  it("emits an onboarding_stall signal for an un-onboarded new account", () => {
    const s = base({
      createdAt: daysAgo(15),
      onboardingCompleted: false,
      lessonsCompleted: 0,
    });
    const health = scoreHealth(s);
    const sigs = deriveSignals(s, health);
    expect(sigs.map((x) => x.type)).toContain("onboarding_stall");
  });

  it("emits a critical payment_risk signal on a failed payment", () => {
    const s = base({ paymentStatus: "failed" });
    const sigs = deriveSignals(s, scoreHealth(s));
    const pay = sigs.find((x) => x.type === "payment_risk");
    expect(pay?.severity).toBe("critical");
  });

  it("flags a thriving power user as an expansion opportunity", () => {
    const s = base({ lessonsCompletedLast30: 8, lastActivityAt: NOW });
    const sigs = deriveSignals(s, scoreHealth(s));
    expect(sigs.map((x) => x.type)).toContain("expansion_signal");
  });

  it("dedupe keys are stable and namespaced by user", () => {
    const s = base({ paymentStatus: "overdue" });
    const sigs = deriveSignals(s, scoreHealth(s));
    expect(sigs.every((x) => x.dedupeKey.endsWith(":u1"))).toBe(true);
  });
});

describe("recommendNextBestActions", () => {
  it("surfaces the most urgent action first", () => {
    const s = base({
      paymentStatus: "failed",
      lastActivityAt: daysAgo(30),
      onboardingCompleted: true,
    });
    const health = scoreHealth(s);
    const actions = recommendNextBestActions(s, health, deriveSignals(s, health));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].priority).toBe("urgent");
  });
});
