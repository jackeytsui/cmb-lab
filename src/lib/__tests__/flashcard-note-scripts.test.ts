import { describe, expect, it } from "vitest";
import { normalizeNoteFlashcardScripts } from "@/lib/flashcard-note-scripts";

describe("starred note flashcard scripts", () => {
  it("derives both scripts from a traditional Mandarin coaching note", async () => {
    await expect(
      normalizeNoteFlashcardScripts("我和我的團隊開會", "mandarin"),
    ).resolves.toEqual({
      chinese: "我和我的團隊開會",
      simplified: "我和我的团队开会",
    });
  });

  it("derives both scripts from a simplified Mandarin notepad note", async () => {
    await expect(
      normalizeNoteFlashcardScripts("我和我的团队开会", "mandarin"),
    ).resolves.toEqual({
      chinese: "我和我的團隊開會",
      simplified: "我和我的团队开会",
    });
  });

  it("does not simplify Cantonese written forms", async () => {
    await expect(
      normalizeNoteFlashcardScripts("我哋聽日開會", "cantonese"),
    ).resolves.toEqual({ chinese: "我哋聽日開會" });
  });
});
