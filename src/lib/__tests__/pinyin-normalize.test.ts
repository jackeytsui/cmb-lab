import { describe, expect, it } from "vitest";
import {
  jyutpingMatches,
  normalizeJyutping,
  normalizePinyin,
  pinyinMatches,
  romanisationMatches,
  stripSentenceForeignWords,
} from "../pinyin-normalize";

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

describe("normalizeJyutping", () => {
  it("strips spaces, tone numbers, and case", () => {
    expect(normalizeJyutping("nei5 hou2")).toBe("neihou");
    expect(normalizeJyutping("Nei Hou")).toBe("neihou");
    expect(normalizeJyutping("neihou")).toBe("neihou");
    expect(normalizeJyutping("nei hou")).toBe("neihou");
  });

  it("drops punctuation", () => {
    expect(normalizeJyutping("nei5 hou2!")).toBe("neihou");
    expect(normalizeJyutping("m4-goi1")).toBe("mgoi");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeJyutping("")).toBe("");
    expect(normalizeJyutping("   ")).toBe("");
  });
});

describe("jyutpingMatches", () => {
  const model = "nei5 hou2 maa3";

  it("matches all tone/spacing variants of the model answer", () => {
    for (const attempt of [
      "nei5 hou2 maa3",
      "nei hou maa",
      "Nei Hou Maa",
      "neihoumaa",
      "nei hou maa!",
    ]) {
      expect(jyutpingMatches(attempt, model)).toBe(true);
    }
  });

  it("rejects wrong answers and empty input", () => {
    expect(jyutpingMatches("nei5 hou2", model)).toBe(false);
    expect(jyutpingMatches("", model)).toBe(false);
  });
});

describe("romanisationMatches", () => {
  it("routes to the right normaliser per language", () => {
    expect(romanisationMatches("ni hao", "nǐ hǎo", "mandarin")).toBe(true);
    expect(romanisationMatches("nei hou", "nei5 hou2", "cantonese")).toBe(true);
    // Cantonese tone numbers are digits, so pinyin's tone-diacritic path would
    // still strip them; the routing just keeps the two systems separate.
    expect(romanisationMatches("nei hou", "nei5 hou2", "mandarin")).toBe(true);
  });
});

describe("stripSentenceForeignWords", () => {
  const sentence = "你好，我叫 John。你叫什么名字？";
  const model = "nǐ hǎo wǒ jiào nǐ jiào shén me míng zì";

  it("removes English words from the sentence out of the submission", () => {
    const stripped = stripSentenceForeignWords(
      "ni hao wo jiao John ni jiao shen me ming zi",
      sentence,
    );
    expect(pinyinMatches(stripped, model)).toBe(true);
  });

  it("is case-insensitive and tolerates attached punctuation", () => {
    const stripped = stripSentenceForeignWords(
      "ni hao wo jiao john. ni jiao shen me ming zi",
      sentence,
    );
    expect(pinyinMatches(stripped, model)).toBe(true);
  });

  it("leaves submissions without the foreign word unchanged", () => {
    expect(
      stripSentenceForeignWords("ni hao wo jiao ni jiao shen me ming zi", sentence),
    ).toBe("ni hao wo jiao ni jiao shen me ming zi");
  });

  it("does nothing for sentences without foreign words", () => {
    expect(stripSentenceForeignWords("dui ya ni chang lai ma", "对呀。你常来吗？")).toBe(
      "dui ya ni chang lai ma",
    );
  });
});
