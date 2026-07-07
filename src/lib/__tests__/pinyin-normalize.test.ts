import { describe, expect, it } from "vitest";
import { normalizePinyin, pinyinMatches } from "../pinyin-normalize";

describe("normalizePinyin", () => {
  it("strips spaces, tones, and case", () => {
    expect(normalizePinyin("Ni chi fan le ma")).toBe("nichifanlema");
    expect(normalizePinyin("nǐ chī fàn le ma")).toBe("nichifanlema");
    expect(normalizePinyin("Nichifanlema")).toBe("nichifanlema");
    expect(normalizePinyin("Ni chifan lema")).toBe("nichifanlema");
    expect(normalizePinyin("nǐ chīfàn lema")).toBe("nichifanlema");
  });

  it("accepts tone-number notation", () => {
    expect(normalizePinyin("ni3 chi1 fan4 le ma")).toBe("nichifanlema");
  });

  it("treats ü, its toned forms, and the u: substitute as v (distinct from u)", () => {
    expect(normalizePinyin("nǚ")).toBe("nv");
    expect(normalizePinyin("nü")).toBe("nv");
    expect(normalizePinyin("nv")).toBe("nv");
    expect(normalizePinyin("nu:")).toBe("nv");
    // plain u stays u — lü and lu must not collide
    expect(normalizePinyin("lu")).toBe("lu");
    expect(normalizePinyin("lǚ")).toBe("lv");
  });

  it("drops apostrophes and punctuation", () => {
    expect(normalizePinyin("xī'ān")).toBe("xian");
    expect(normalizePinyin("Nǐ hǎo!")).toBe("nihao");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePinyin("")).toBe("");
    expect(normalizePinyin("   ")).toBe("");
  });
});

describe("pinyinMatches", () => {
  const model = "nǐ chī fàn le ma";

  it("matches all tone/spacing variants of the model answer", () => {
    for (const attempt of [
      "Ni chi fan le ma",
      "nǐ chī fàn le ma",
      "Nichifanlema",
      "Ni chifan lema",
      "nǐ chīfàn lema",
      "ni3 chi1 fan4 le ma",
    ]) {
      expect(pinyinMatches(attempt, model)).toBe(true);
    }
  });

  it("rejects wrong answers", () => {
    expect(pinyinMatches("ni hao ma", model)).toBe(false);
    expect(pinyinMatches("", model)).toBe(false);
  });
});
