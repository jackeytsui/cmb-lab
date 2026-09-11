import { describe, expect, it } from "vitest";
import {
  coachingFeedbackPromptWindow,
  coachingFeedbackSessionLabel,
} from "@/lib/coaching-feedback-prompt";

describe("coaching feedback prompt policy", () => {
  it("waits until a session is over and only considers recent sessions", () => {
    const now = new Date("2026-09-11T20:00:00.000Z");
    const window = coachingFeedbackPromptWindow(now);

    expect(window.latestEligibleAt.toISOString()).toBe(
      "2026-09-11T18:45:00.000Z",
    );
    expect(window.oldestEligibleAt.toISOString()).toBe(
      "2026-08-12T20:00:00.000Z",
    );
    expect(window.cooldownStartedAt.toISOString()).toBe(
      "2026-08-28T20:00:00.000Z",
    );
  });

  it("uses student-facing names for both coaching formats", () => {
    expect(coachingFeedbackSessionLabel("one_on_one")).toBe("1:1 coaching");
    expect(coachingFeedbackSessionLabel("inner_circle")).toBe("ICGC");
  });
});
