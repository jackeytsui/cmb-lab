// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MandarinSentenceInput } from "@/components/assignments/MandarinSentenceInput";

vi.mock("@/hooks/useTTS", () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
    isLoading: false,
  }),
}));

afterEach(cleanup);

describe("assignment review romanisation editing", () => {
  it("turns numbered Mandarin pinyin into tone marks while the coach types", () => {
    const onValueChange = vi.fn();
    render(
      <MandarinSentenceInput
        value={{ chineseText: "你好", pinyin: "ni hao", english: "Hello" }}
        onValueChange={onValueChange}
        annotationEditable
        lang="mandarin"
      />,
    );

    fireEvent.change(screen.getByLabelText("Pinyin (editable)"), {
      target: { value: "ni3 hao3" },
    });

    expect(onValueChange).toHaveBeenLastCalledWith({
      chineseText: "你好",
      pinyin: "nǐ hǎo",
      english: "Hello",
    });
  });

  it("keeps Cantonese Jyutping tone digits unchanged", () => {
    const onValueChange = vi.fn();
    render(
      <MandarinSentenceInput
        value={{ chineseText: "你好", pinyin: "nei hou", english: "Hello" }}
        onValueChange={onValueChange}
        annotationEditable
        lang="cantonese"
      />,
    );

    fireEvent.change(screen.getByLabelText("Jyutping (editable)"), {
      target: { value: "nei5 hou2" },
    });

    expect(onValueChange).toHaveBeenLastCalledWith({
      chineseText: "你好",
      pinyin: "nei5 hou2",
      english: "Hello",
    });
  });
});
