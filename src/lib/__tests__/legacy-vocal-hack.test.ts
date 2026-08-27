import { describe, expect, it } from "vitest";
import { legacyVideoAskUrl } from "@/lib/legacy-vocal-hack";

describe("legacy VideoAsk Vocal Hack handoff", () => {
  it("extracts the live VideoAsk flow from a legacy text lesson", () => {
    expect(
      legacyVideoAskUrl({
        lessonType: "text",
        title: "Discussing Cultural Identity (Vocal Hack)",
        html: '<p><a href="https://www.videoask.com/fjp9i2jjz">Open</a></p>',
      }),
    ).toBe("https://www.videoask.com/fjp9i2jjz");
  });

  it("does not transform ordinary text lessons or untrusted links", () => {
    expect(
      legacyVideoAskUrl({
        lessonType: "text",
        title: "Course notes",
        html: '<a href="https://www.videoask.com/example">Open</a>',
      }),
    ).toBeNull();
    expect(
      legacyVideoAskUrl({
        lessonType: "text",
        title: "Example Vocal Hack",
        html: '<a href="https://example.com/not-videoask">Open</a>',
      }),
    ).toBeNull();
  });
});
