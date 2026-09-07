import { describe, expect, it } from "vitest";
import { readerTypographySizes } from "@/lib/reader-typography";

describe("reader typography", () => {
  it("keeps Chinese visually primary at every supported size", () => {
    for (const chineseSize of [12, 18, 24, 32]) {
      const sizes = readerTypographySizes(chineseSize);
      expect(sizes.romanizationSize).toBeLessThan(chineseSize);
      expect(sizes.englishSize).toBeLessThan(chineseSize);
    }
  });
});
