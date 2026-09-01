import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "test-user" })),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "test-model"),
}));

describe("Cantonese passage generation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.generateText.mockResolvedValue({
      text: "我只有一只猫，学习广东话。",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a canonical Traditional passage even if the model emits Simplified", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://example.com/api/reader/generate-article", {
        method: "POST",
        body: JSON.stringify({
          topic: "養貓",
          level: "2",
          language: "zh-HK",
          script: "simplified",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      article: "我只有一隻貓，學習廣東話。",
      language: "zh-HK",
      script: "traditional",
    });
  });
});
