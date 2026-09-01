import { describe, expect, it } from "vitest";
import { parseDateRange } from "@/lib/analytics";

describe("parseDateRange", () => {
  it("includes the entire selected to-date", () => {
    const params = new URLSearchParams({
      from: "2026-08-01",
      to: "2026-08-31",
    });

    const range = parseDateRange(params);

    expect(range.from?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });
});
