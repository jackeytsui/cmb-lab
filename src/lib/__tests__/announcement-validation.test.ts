import { describe, expect, it } from "vitest";
import { announcementInputSchema } from "@/lib/announcement-validation";

describe("announcement validation", () => {
  it("accepts a concise announcement with an internal CTA", () => {
    const result = announcementInputSchema.safeParse({
      title: "Live coaching starts soon",
      body: "Join us in CMB Lab at 7:00 PM Eastern.",
      linkUrl: "/dashboard/coaching/group-schedule",
      linkLabel: "View schedule",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsafe and protocol-relative links", () => {
    expect(
      announcementInputSchema.safeParse({
        title: "Important update",
        body: "Please review this update.",
        linkUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      announcementInputSchema.safeParse({
        title: "Important update",
        body: "Please review this update.",
        linkUrl: "//malicious.example",
      }).success,
    ).toBe(false);
  });

  it("requires a link when button text is supplied", () => {
    const result = announcementInputSchema.safeParse({
      title: "Important update",
      body: "Please review this update.",
      linkLabel: "Read now",
    });

    expect(result.success).toBe(false);
  });

  it("accepts role-and-tag targeting", () => {
    const result = announcementInputSchema.safeParse({
      title: "ICGC update",
      body: "This is only for current ICGC students.",
      audienceMode: "targeted",
      audienceTagIds: ["d5579b7d-76f1-4b43-8392-a4f2f38fc2fe"],
      audienceRoles: ["student"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty targeted audience", () => {
    const result = announcementInputSchema.safeParse({
      title: "Targeted update",
      body: "This should not accidentally go to everyone.",
      audienceMode: "targeted",
      audienceTagIds: [],
      audienceRoles: [],
    });

    expect(result.success).toBe(false);
  });
});
