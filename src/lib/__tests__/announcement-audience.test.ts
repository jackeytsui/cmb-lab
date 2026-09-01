import { describe, expect, it } from "vitest";
import { announcementMatchesAudience } from "@/lib/announcement-audience";

describe("announcement audiences", () => {
  it("shows all-audience announcements to every role", () => {
    expect(
      announcementMatchesAudience(
        {
          audienceMode: "all",
          audienceTagIds: [],
          audienceRoles: [],
        },
        { role: "coach", tagIds: [] },
      ),
    ).toBe(true);
  });

  it("matches any selected tag when no role restriction is selected", () => {
    expect(
      announcementMatchesAudience(
        {
          audienceMode: "targeted",
          audienceTagIds: ["icgc-tag", "other-tag"],
          audienceRoles: [],
        },
        { role: "student", tagIds: ["icgc-tag"] },
      ),
    ).toBe(true);
  });

  it("requires both groups when roles and tags are selected", () => {
    const announcement = {
      audienceMode: "targeted" as const,
      audienceTagIds: ["icgc-tag"],
      audienceRoles: ["student" as const],
    };

    expect(
      announcementMatchesAudience(announcement, {
        role: "student",
        tagIds: ["icgc-tag"],
      }),
    ).toBe(true);
    expect(
      announcementMatchesAudience(announcement, {
        role: "coach",
        tagIds: ["icgc-tag"],
      }),
    ).toBe(false);
    expect(
      announcementMatchesAudience(announcement, {
        role: "student",
        tagIds: [],
      }),
    ).toBe(false);
  });
});
