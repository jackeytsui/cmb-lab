import { describe, expect, it } from "vitest";
import {
  buildBetaFeedbackStatusEmailHtml,
  getBetaFeedbackStatusCopy,
  PUBLIC_BETA_FEEDBACK_STATUS_LABELS,
} from "@/lib/beta-feedback-status";

describe("beta feedback status updates", () => {
  it("provides clear public copy for every admin stage", () => {
    expect(PUBLIC_BETA_FEEDBACK_STATUS_LABELS).toEqual({
      new: "Submitted",
      reviewing: "Being reviewed",
      planned: "Planned",
      resolved: "Resolved",
      closed: "Closed",
    });

    for (const status of Object.keys(
      PUBLIC_BETA_FEEDBACK_STATUS_LABELS,
    ) as Array<keyof typeof PUBLIC_BETA_FEEDBACK_STATUS_LABELS>) {
      const copy = getBetaFeedbackStatusCopy({
        category: "bug",
        status,
        reference: "abcd1234",
      });
      expect(copy.message.length).toBeGreaterThan(20);
      expect(copy.notificationTitle).toContain(copy.statusLabel);
      expect(copy.notificationBody).toContain("abcd1234");
      expect(copy.emailSubject).toContain("abcd1234");
    }
  });

  it("uses student-friendly language for an active review", () => {
    const copy = getBetaFeedbackStatusCopy({
      category: "feature_request",
      status: "reviewing",
      reference: "feed1234",
    });

    expect(copy.statusLabel).toBe("Being reviewed");
    expect(copy.message).toMatch(/reviewing.*working/i);
  });

  it("escapes student-controlled values in transactional email HTML", () => {
    const html = buildBetaFeedbackStatusEmailHtml({
      studentName: '<img src=x onerror="alert(1)">',
      categoryLabel: "Bug report",
      statusLabel: "Resolved",
      message: "Resolved safely.",
      reference: "abcd1234",
      dashboardUrl: "https://cmb-lab.thecmblueprint.com/dashboard?a=1&b=2",
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("a=1&amp;b=2");
  });
});
