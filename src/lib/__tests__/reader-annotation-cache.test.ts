// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateReaderRomanization,
  readReaderAnnotationCache,
  updateReaderAnnotationCache,
} from "@/lib/reader-annotation-cache";

describe("reader annotation cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores translations separately by source text and language", () => {
    updateReaderAnnotationCache("你好", "zh-CN", {
      properTranslations: ["Hello"],
    });
    updateReaderAnnotationCache("你好", "zh-HK", {
      properTranslations: ["Hello (Cantonese)"],
    });

    expect(
      readReaderAnnotationCache("你好", "zh-CN")?.properTranslations,
    ).toEqual(["Hello"]);
    expect(
      readReaderAnnotationCache("你好", "zh-HK")?.properTranslations,
    ).toEqual(["Hello (Cantonese)"]);
  });

  it("persists generated romanization for reuse", () => {
    const generated = getOrCreateReaderRomanization("你好", "zh-CN");
    expect(generated).toBeTruthy();
    expect(readReaderAnnotationCache("你好", "zh-CN")?.romanization).toBe(
      generated,
    );
  });
});
