import { describe, expect, it } from "vitest";
import { COACHING_TIME_ZONES } from "@/lib/coaching-time-zones";

describe("coaching timezone choices", () => {
  it("offers a daylight-saving-aware New Zealand timezone", () => {
    expect(COACHING_TIME_ZONES).toContainEqual({
      value: "Pacific/Auckland",
      label: "New Zealand",
      detail: "Auckland time",
    });
  });

  it("formats winter and summer sessions using New Zealand daylight saving", () => {
    const formatter = new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });

    expect(formatter.format(new Date("2026-07-01T00:00:00Z"))).toContain("12:00");
    expect(formatter.format(new Date("2026-12-01T00:00:00Z"))).toContain("13:00");
  });
});
