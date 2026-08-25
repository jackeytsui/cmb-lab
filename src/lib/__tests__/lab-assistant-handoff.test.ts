import { describe, expect, it } from "vitest";
import {
  buildHandoffTaskBody,
  HANDOFF_ASSIGNEE_EMAIL,
  HANDOFF_RESPONSE_WINDOW,
  HANDOFF_SUBMITTER_EMAIL,
  normalizeHandoffSummary,
  STANDARD_HANDOFF_DUE_HOURS,
} from "@/lib/lab-assistant/handoff-policy";
import { selectExactGhlUserId } from "@/lib/ghl/user-resolution";

describe("Lab Assistant handoff policy", () => {
  it("uses the requested SLA and routing identities", () => {
    expect(HANDOFF_RESPONSE_WINDOW).toBe("48 hours");
    expect(STANDARD_HANDOFF_DUE_HOURS).toBe(48);
    expect(HANDOFF_SUBMITTER_EMAIL).toBe(
      "jackey.tsui@thecmblueprint.com",
    );
    expect(HANDOFF_ASSIGNEE_EMAIL).toBe("contact@thecmblueprint.com");
  });

  it("builds a triage-first task with submitter, student email, and transcript", () => {
    const body = buildHandoffTaskBody({
      studentName: "Mei Wong",
      studentEmail: "mei@example.com",
      summary: "Mei cannot access the Week 3 lesson and wants human help.",
      intent: "faq_navigation",
      confidence: 0.87,
      urgent: false,
      timestamp: new Date("2026-08-25T12:00:00.000Z"),
      transcript: "Student: I cannot access Week 3.\nAssistant: I can help.",
    });

    expect(body).toContain(
      "Submitted by: jackey.tsui@thecmblueprint.com",
    );
    expect(body).toContain("Assigned to: contact@thecmblueprint.com");
    expect(body).toContain("Student email: mei@example.com");
    expect(body).toContain(
      "Conversation summary: Mei cannot access the Week 3 lesson and wants human help.",
    );
    expect(body).toContain("--- Full transcript ---");
    expect(body.indexOf("Conversation summary:")).toBeLessThan(
      body.indexOf("--- Full transcript ---"),
    );
  });

  it("creates a compact fallback summary when AI summarization is unavailable", () => {
    expect(
      normalizeHandoffSummary(null, "  I need   a person to fix my access.  "),
    ).toBe(
      "Student is asking for support with: I need a person to fix my access.",
    );
  });
});

describe("GHL support assignee resolution", () => {
  const users = [
    { id: "jackey-id", email: "jackey.tsui@thecmblueprint.com" },
    { id: "support-id", email: "Contact@TheCMBlueprint.com" },
  ];

  it("matches the support user by exact email, case-insensitively", () => {
    expect(
      selectExactGhlUserId(users, "contact@thecmblueprint.com"),
    ).toBe("support-id");
  });

  it("does not assign a partial or different email", () => {
    expect(selectExactGhlUserId(users, "contact@thecmblueprint.co")).toBeNull();
  });
});
