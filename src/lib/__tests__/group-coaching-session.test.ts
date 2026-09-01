import { describe, expect, it } from "vitest";
import { getCoachingSessionPresentation } from "@/lib/group-coaching-session";

describe("group coaching session presentation", () => {
  it("uses Cantonese styling only when the title explicitly says Canto or Cantonese", () => {
    expect(
      getCoachingSessionPresentation("(CANTO SESSION) Friday Inner Circle Group Coaching"),
    ).toEqual({
      language: "cantonese",
      languageLabel: "Cantonese",
      name: "Canto Session",
    });
    expect(getCoachingSessionPresentation("Cantonese Sunday coaching").language).toBe(
      "cantonese",
    );
  });

  it("defaults every session without an explicit Canto label to Mandarin", () => {
    expect(getCoachingSessionPresentation("CMB all levels Monday coaching").language).toBe(
      "mandarin",
    );
    expect(getCoachingSessionPresentation("General group coaching").languageLabel).toBe(
      "Mandarin",
    );
  });

  it.each([
    ["(INTERMEDIATE) Wednesday Inner Circle Group Coaching", "CMB: Intermediate"],
    ["(BEGINNER) Friday Inner Circle Group Coaching", "CMB: Foundation"],
    ["Foundation Monday coaching", "CMB: Foundation"],
    ["CMB ALL LEVELS Monday coaching", "CMB: All Levels"],
    ["(EUROPE TIMEZONE) Thursday Inner Circle Group Coaching", "CMB: EU Timezone"],
  ])("standardizes %s as %s", (title, expectedName) => {
    expect(getCoachingSessionPresentation(title).name).toBe(expectedName);
  });
});
