// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlashCard } from "./FlashcardsClient";

describe("FlashCard long-content layout", () => {
  it("lets both faces grow beyond the minimum height instead of clipping", () => {
    const { container } = render(
      <FlashCard
        card={{
          id: "long-card",
          source: "coaching",
          chinese: "星期一星期三和星期五開始上班的前十五分鐘我們會開會",
          pinyin:
            "xīng qī yī xīng qī sān hé xīng qī wǔ kāi shǐ shàng bān de qián shí wǔ fēn zhōng wǒ men huì kāi huì",
          romanization: "",
          english: "We meet before work on Monday, Wednesday, and Friday.",
          pane: "mandarin",
          createdAt: "2026-09-05T00:00:00.000Z",
        }}
        displayChinese="星期一星期三和星期五开始上班的前十五分钟我们会开会"
        isFlipped
        onFlip={vi.fn()}
        onRemove={vi.fn()}
        speak={vi.fn().mockResolvedValue(undefined)}
        ttsLoading={false}
        ttsPlaying={false}
      />,
    );

    const interactiveCard = container.querySelector(".group > button");
    expect(interactiveCard?.getAttribute("type")).toBe("button");

    const shell = interactiveCard?.firstElementChild;
    expect(shell?.className).toContain("grid");
    expect(shell?.className).toContain("min-h-[240px]");

    const faces = shell?.querySelectorAll(":scope > div") ?? [];
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(face.className).toContain("col-start-1");
      expect(face.className).toContain("row-start-1");
      expect(face.className).toContain("min-h-[240px]");
      expect(face.className).not.toContain("absolute");
      expect(face.className).not.toContain("inset-0");
    }

    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelectorAll(".group > button")).toHaveLength(2);
    expect(container.querySelector('button[title="Play (Mandarin)"]')).not.toBeNull();
  });
});
