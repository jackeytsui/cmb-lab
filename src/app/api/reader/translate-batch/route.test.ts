import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "test-user" })),
}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: vi.fn(({ name, description, schema }) => ({
      type: "object",
      name,
      description,
      schema,
    })),
  },
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "test-model"),
}));

function translationRequest(language: "zh-CN" | "zh-HK" = "zh-CN") {
  return new NextRequest("https://example.com/api/reader/translate-batch", {
    method: "POST",
    body: JSON.stringify({
      texts: ["你想要什么"],
      mode: "proper",
      language,
    }),
  });
}

function wordRequest() {
  return new NextRequest("https://example.com/api/reader/translate-batch", {
    method: "POST",
    body: JSON.stringify({
      words: ["你好", "朋友"],
      mode: "words",
      language: "zh-CN",
    }),
  });
}

describe("batch translation resilience", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a non-retryable outage immediately when provider credits are exhausted", async () => {
    const quotaError = Object.assign(
      new Error("You have no credits remaining. Add credits to continue."),
      {
        responseBody: JSON.stringify({
          error: { code: "credit_balance_exhausted", type: "insufficient_quota" },
        }),
      },
    );
    mocks.generateText.mockRejectedValue(quotaError);

    const { POST } = await import("./route");
    const response = await POST(translationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "translation_unavailable",
      retryable: false,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        timeout: { totalMs: 15_000 },
      }),
    );
  });

  it("still returns a normal translation when the provider succeeds", async () => {
    mocks.generateText.mockResolvedValue({ text: "What do you want?" });

    const { POST } = await import("./route");
    const response = await POST(translationRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      translations: ["What do you want?"],
      provider: "openai",
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Return ONLY the English translation"),
        prompt: "你想要什么",
      }),
    );
    expect(mocks.generateText.mock.calls[0]?.[0]).not.toHaveProperty("output");
  });

  it("uses plain text output for a single short phrase", async () => {
    mocks.generateText.mockResolvedValue({ text: "although" });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://example.com/api/reader/translate-batch", {
        method: "POST",
        body: JSON.stringify({
          texts: ["雖然"],
          mode: "proper",
          language: "zh-CN",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      translations: ["although"],
    });
  });

  it("requires an exact source-aligned schema for a real batch", async () => {
    mocks.generateText.mockResolvedValue({
      output: { translations: ["Hello", "Friend"] },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://example.com/api/reader/translate-batch", {
        method: "POST",
        body: JSON.stringify({
          texts: ["你好", "朋友"],
          mode: "proper",
          language: "zh-CN",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      translations: ["Hello", "Friend"],
    });
    const output = mocks.generateText.mock.calls[0]?.[0]?.output;
    expect(output).toMatchObject({
      type: "object",
      name: "sentence_translations",
      description: "Exactly 2 English translations in source order",
    });
    expect(
      output.schema.safeParse({ translations: ["Hello"] }).success,
    ).toBe(false);
    expect(
      output.schema.safeParse({ translations: ["Hello", "Friend"] }).success,
    ).toBe(true);
  });

  it("rejects an empty single-sentence response as retryable", async () => {
    mocks.generateText.mockResolvedValue({ text: "   " });

    const { POST } = await import("./route");
    const response = await POST(translationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "translation_unavailable",
      retryable: true,
    });
  });

  it("skips OpenAI while the quota circuit is open", async () => {
    mocks.generateText.mockRejectedValue(
      new Error("insufficient_quota: no credits remaining"),
    );

    const { POST } = await import("./route");
    const firstResponse = await POST(translationRequest());
    const secondResponse = await POST(translationRequest());

    expect(firstResponse.status).toBe(503);
    expect(secondResponse.status).toBe(503);
    await expect(secondResponse.json()).resolves.toMatchObject({
      code: "translation_unavailable",
      retryable: false,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("marks transient provider errors as retryable", async () => {
    mocks.generateText.mockRejectedValue(new Error("Connection timed out"));

    const { POST } = await import("./route");
    const response = await POST(translationRequest("zh-HK"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "translation_unavailable",
      retryable: true,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("returns OpenAI word glosses when the provider succeeds", async () => {
    mocks.generateText.mockResolvedValue({
      text: '{"你好":"Hello","朋友":"Friend"}',
    });

    const { POST } = await import("./route");
    const response = await POST(wordRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      glosses: { 你好: "Hello", 朋友: "Friend" },
      provider: "openai",
    });
  });
});
