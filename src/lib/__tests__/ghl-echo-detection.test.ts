import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  getNeonSql: () => sqlMock,
}));

import { isEchoWebhook, markOutboundChange } from "@/lib/ghl/echo-detection";

describe("GHL echo detection without Redis", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("stores and atomically consumes the same hashed Neon marker", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ active: true }]);

    await markOutboundChange("contact-1", "tag", "private-access-tag");
    const isEcho = await isEchoWebhook(
      "contact-1",
      "tag",
      "private-access-tag",
    );

    expect(isEcho).toBe(true);
    const insertValues = sqlMock.mock.calls[0].slice(1);
    const consumeValues = sqlMock.mock.calls[1].slice(1);
    expect(insertValues[0]).toBe(consumeValues[0]);
    expect(String(insertValues[0])).not.toContain("private-access-tag");
  });
});
