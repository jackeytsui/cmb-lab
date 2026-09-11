import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("coaching feedback prompt wiring", () => {
  it("shows the prompt on the home dashboard without placing it in a global popup", () => {
    const dashboard = source("src/app/(dashboard)/dashboard/page.tsx");
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(dashboard).toContain("<SessionFeedbackPrompt />");
    expect(layout).not.toContain("SessionFeedbackPrompt");
  });

  it("limits prompts to completed-looking recent sessions and applies a durable cooldown", () => {
    const route = source("src/app/api/coaching/rating-prompt/route.ts");

    expect(route).toContain("getRealUser");
    expect(route).not.toContain("getCurrentUser");
    expect(route).toContain("recentPrompt");
    expect(route).toContain("sessionHasNotes");
    expect(route).toContain("coachingSessions.recordingUrl");
    expect(route).toContain("COACHING_FEEDBACK_PROMPT_MAX_SHOWS_PER_SESSION");
  });

  it("keeps View As and unrelated students from submitting ratings", () => {
    const ratingRoute = source(
      "src/app/api/coaching/sessions/[sessionId]/rating/route.ts",
    );

    const postHandler = ratingRoute.slice(
      ratingRoute.indexOf("export async function POST"),
    );
    expect(postHandler).toContain("getRealUser");
    expect(postHandler).toContain("getRateableCoachingSession");
    expect(postHandler).toContain("onConflictDoNothing");
  });

  it("stores delivery state separately from ratings", () => {
    const migration = source(
      "src/db/migrations/0120_gentle_coaching_feedback_prompts.sql",
    );

    expect(migration).toContain('"coaching_feedback_prompt_states"');
    expect(migration).toContain('"prompt_count"');
    expect(migration).toContain('"last_prompted_at"');
    expect(migration).toContain('"skipped_at"');
    expect(migration).not.toContain("coaching_session_ratings");
  });
});
