import { describe, expect, it } from "vitest";
import { visibleCourseCoverStatuses } from "@/lib/course-library-access";

describe("course library cover statuses", () => {
  it("allows admins to render draft covers in the admin catalogue", () => {
    expect(visibleCourseCoverStatuses("admin")).toEqual([
      "draft",
      "preview",
      "published",
    ]);
  });

  it("does not expose draft covers to coaches or students", () => {
    expect(visibleCourseCoverStatuses("coach")).toEqual([
      "published",
      "preview",
    ]);
    expect(visibleCourseCoverStatuses("student")).toEqual(["published"]);
  });
});
