import { describe, expect, it } from "vitest";
import { shouldNotifyAssignmentReview } from "@/lib/assignment-review-notification";

describe("assignment review notifications", () => {
  it("notifies once for the first whole-assignment review", () => {
    expect(shouldNotifyAssignmentReview("submitted")).toBe(true);
    expect(shouldNotifyAssignmentReview("in_review")).toBe(true);
    expect(shouldNotifyAssignmentReview("reviewed")).toBe(false);
  });
});
