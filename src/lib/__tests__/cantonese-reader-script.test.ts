import { describe, expect, it } from "vitest";
import {
  canonicalizeCantonesePassage,
  getCantonesePassageDisplayText,
  getCantoneseReaderScriptMode,
} from "@/lib/cantonese-reader-script";

describe("Cantonese reader script handling", () => {
  it("normalizes generated or imported text to a Traditional source", async () => {
    const source = await canonicalizeCantonesePassage(
      "我只有一只猫，学习广东话。",
    );

    expect(source).toBe("我只有一隻貓，學習廣東話。");
  });

  it("derives Simplified display text from the Traditional source", async () => {
    const source = "一隻貓喺銀行後面。";

    await expect(
      getCantonesePassageDisplayText(source, "simplified"),
    ).resolves.toBe("一只猫喺银行后面。");
    await expect(
      getCantonesePassageDisplayText(source, "traditional"),
    ).resolves.toBe(source);
    await expect(
      getCantonesePassageDisplayText(source, "original"),
    ).resolves.toBe(source);
  });

  it("treats Original as Traditional in the Cantonese reader", () => {
    expect(getCantoneseReaderScriptMode("original")).toBe("traditional");
    expect(getCantoneseReaderScriptMode("traditional")).toBe("traditional");
    expect(getCantoneseReaderScriptMode("simplified")).toBe("simplified");
  });
});
