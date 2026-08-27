import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerNeedsAutomaticHandoff } from "@/lib/lab-assistant/case-resolution";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Lab Assistant automatic unresolved safety net", () => {
  it("escalates empty, truncated, filtered, and uncertain answers", () => {
    expect(answerNeedsAutomaticHandoff("", "stop")).toBe(true);
    expect(answerNeedsAutomaticHandoff("A partial answer", "length")).toBe(true);
    expect(answerNeedsAutomaticHandoff("I don't know that answer.", "stop")).toBe(true);
    expect(
      answerNeedsAutomaticHandoff(
        "Please contact our support team for the answer.",
        "stop",
      ),
    ).toBe(true);
  });

  it("does not escalate a complete supported answer", () => {
    expect(
      answerNeedsAutomaticHandoff(
        "Your program starts on September 8, 2026.",
        "stop",
      ),
    ).toBe(false);
  });
});

describe("student-confirmed resolution and CSAT routing", () => {
  it("creates a GHL handoff when the student says the AI did not resolve it", () => {
    const route = source(
      "src/app/api/lab-assistant/resolution/route.ts",
    );

    expect(route).toContain('action: z.literal("unresolved")');
    expect(route).toContain("createEscalationTask({");
    expect(route).toContain('intent: "student_marked_unresolved"');
    expect(route).toContain("discordNotified");
  });

  it("accepts CSAT only after a server-recorded resolved confirmation", () => {
    const route = source(
      "src/app/api/lab-assistant/resolution/route.ts",
    );
    const panel = source(
      "src/components/lab-assistant/LabAssistantPanel.tsx",
    );

    expect(route).toContain("existingDecision?.resolved !== true");
    expect(route).toContain(
      'CSAT is only available for a confirmed resolution',
    );
    expect(panel).toContain("? { status: 'rating' }");
    expect(panel).toContain(
      "state.status === 'rating' || state.status === 'rating-sending'",
    );
    expect(panel).toContain("Yes, resolved");
    expect(panel).toContain("No, I need help");
  });
});
