import { describe, expect, it } from "vitest";
import {
  coachingTypographySizes,
  readerTypographySizes,
} from "@/lib/reader-typography";

describe("reader typography", () => {
  it("keeps Chinese visually primary at every supported size", () => {
    for (const chineseSize of [12, 18, 24, 32]) {
      const sizes = readerTypographySizes(chineseSize);
      expect(sizes.romanizationSize).toBeLessThan(chineseSize);
      expect(sizes.englishSize).toBeLessThan(chineseSize);
    }
  });

  it("keeps coaching cues readable during screen sharing", () => {
    expect(coachingTypographySizes(18)).toEqual({
      romanizationSize: 22,
      englishSize: 20,
    });
  });
});
