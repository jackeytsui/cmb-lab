export const COACHING_FEEDBACK_PROMPT_COOLDOWN_DAYS = 14;
export const COACHING_FEEDBACK_PROMPT_LOOKBACK_DAYS = 30;
export const COACHING_FEEDBACK_PROMPT_DELAY_MINUTES = 75;
export const COACHING_FEEDBACK_PROMPT_MAX_SHOWS_PER_SESSION = 2;

export type CoachingFeedbackSessionType = "one_on_one" | "inner_circle";

export function coachingFeedbackSessionLabel(
  type: CoachingFeedbackSessionType,
): string {
  return type === "one_on_one" ? "1:1 coaching" : "ICGC";
}

export function coachingFeedbackPromptWindow(now = new Date()) {
  return {
    latestEligibleAt: new Date(
      now.getTime() - COACHING_FEEDBACK_PROMPT_DELAY_MINUTES * 60_000,
    ),
    oldestEligibleAt: new Date(
      now.getTime() - COACHING_FEEDBACK_PROMPT_LOOKBACK_DAYS * 86_400_000,
    ),
    cooldownStartedAt: new Date(
      now.getTime() - COACHING_FEEDBACK_PROMPT_COOLDOWN_DAYS * 86_400_000,
    ),
  };
}
