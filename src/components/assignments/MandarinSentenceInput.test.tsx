// @vitest-environment happy-dom

import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MandarinSentenceInput } from "@/components/assignments/MandarinSentenceInput";
import type { MandarinSentenceValue } from "@/components/assignments/MandarinSentenceInput";
import { TextAssignmentViewer } from "@/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/TextAssignmentViewer";

const generationMocks = vi.hoisted(() => ({
  generateAnnotation: vi.fn(),
}));

vi.mock("@/lib/mandarin-generation", () => ({
  fetchProperTranslations: vi.fn(),
  generateAnnotation: generationMocks.generateAnnotation,
}));

vi.mock("@/hooks/useTTS", () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
    isLoading: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function StudentHarness() {
  const [value, setValue] = useState<MandarinSentenceValue | null>(null);
  return <MandarinSentenceInput value={value} onValueChange={setValue} />;
}

describe("student assignment translation fallback", () => {
  it("preserves local pinyin and lets the student enter English manually", async () => {
    generationMocks.generateAnnotation.mockResolvedValue({
      pinyin: "nǐ xiǎng yào shén me",
      english: "",
    });
    render(<StudentHarness />);

    const chineseInput = screen.getByRole("textbox");
    fireEvent.change(chineseInput, { target: { value: "你想要什么" } });
    fireEvent.keyDown(chineseInput, { key: "Enter" });

    expect(
      await screen.findByText(/Automatic English translation is temporarily unavailable/),
    ).toBeTruthy();
    expect(generationMocks.generateAnnotation).toHaveBeenCalledWith(
      "你想要什么",
      "mandarin",
      { requireEnglish: false },
    );

    const englishInput = screen.getByLabelText("English translation (required)");
    fireEvent.change(englishInput, { target: { value: "What do you want?" } });
    expect((englishInput as HTMLInputElement).value).toBe("What do you want?");
  });

  it("enables assignment submission after the manual English fallback is completed", async () => {
    generationMocks.generateAnnotation.mockResolvedValue({
      pinyin: "nǐ hǎo",
      english: "",
    });
    render(
      <TextAssignmentViewer
        lessonId="lesson-1"
        prompts={[{ id: "prompt-1", label: "Greeting", description: "" }]}
        initialSubmission={null}
      />,
    );

    const chineseInput = screen.getByRole("textbox");
    fireEvent.change(chineseInput, { target: { value: "你好" } });
    fireEvent.keyDown(chineseInput, { key: "Enter" });

    const englishInput = await screen.findByLabelText(
      "English translation (required)",
    );
    const submitButton = screen.getByRole("button", {
      name: "Submit Assignment",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    fireEvent.change(englishInput, { target: { value: "Hello" } });
    expect(submitButton.disabled).toBe(false);
  });
});

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
