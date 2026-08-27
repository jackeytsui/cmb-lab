import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  getNeonSql: () => sqlMock,
}));

import { consumeDatabaseRateLimit } from "@/lib/rate-limit";

describe("database rate-limit fallback", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("enforces the count returned by the shared database window", async () => {
    sqlMock.mockResolvedValue([{ request_count: 3 }]);

    const result = await consumeDatabaseRateLimit(
      { requests: 3, windowMs: 60_000, prefix: "test" },
      "student@example.com",
      120_000,
    );

    expect(result).toEqual({
      success: true,
      limit: 3,
      remaining: 0,
      reset: 180_000,
    });
    const parameterValues = sqlMock.mock.calls[0].slice(1);
    expect(parameterValues.join(" ")).not.toContain("student@example.com");
  });

  it("fails over to a process-local limit instead of allowing everything", async () => {
    sqlMock.mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const definition = { requests: 2, windowMs: 60_000, prefix: "local-test" };

    const first = await consumeDatabaseRateLimit(definition, "same-user", 240_000);
    const second = await consumeDatabaseRateLimit(definition, "same-user", 240_000);
    const third = await consumeDatabaseRateLimit(definition, "same-user", 240_000);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
  });
});
