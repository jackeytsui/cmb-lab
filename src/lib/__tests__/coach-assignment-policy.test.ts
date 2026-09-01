import { describe, expect, it } from "vitest";
import {
  isProgramCurrent,
  isSelfStudyCoachName,
  matchCoachStaff,
  normalizeCoachSourceName,
} from "@/lib/coach-assignment-policy";

const staff = [
  { id: "jane", email: "jane.lee@thecmblueprint.com", name: "Jane Lee" },
  { id: "janelle", email: "janelle.wong@thecmblueprint.com", name: "Janelle Wong" },
  { id: "tiffany", email: "tiffany.hui@thecmblueprint.com", name: "Tiffany Hui" },
];

describe("coach assignment policy", () => {
  it("matches unique GHL first names and exact staff names", () => {
    expect(matchCoachStaff("Jane", staff)).toEqual({
      status: "matched",
      coach: staff[0],
    });
    expect(matchCoachStaff("Janelle Wong", staff)).toEqual({
      status: "matched",
      coach: staff[1],
    });
  });

  it("does not turn self-study or ambiguous names into assignments", () => {
    expect(isSelfStudyCoachName("No coach (self-study)")).toBe(true);
    expect(matchCoachStaff("No coach (self-study)", staff)).toEqual({
      status: "self_study",
    });
    expect(
      matchCoachStaff("Jane", [
        ...staff,
        { id: "jane-2", email: "jane.two@example.com", name: "Jane Two" },
      ]),
    ).toEqual({ status: "ambiguous" });
  });

  it("normalizes punctuation and keeps access active through the end date", () => {
    expect(normalizeCoachSourceName("  JANE-LEE  ")).toBe("jane lee");
    expect(isProgramCurrent("2026-09-01", "2026-09-01")).toBe(true);
    expect(isProgramCurrent("2026-08-31", "2026-09-01")).toBe(false);
    expect(isProgramCurrent(null, "2026-09-01")).toBe(true);
  });
});
