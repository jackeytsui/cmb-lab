import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import type { WordSegment } from "@/lib/segmenter";

vi.mock("@/components/reader/SentenceControls", () => ({
  SentenceControls: () => null,
}));

const splitBankSegments: WordSegment[] = [
  { text: "銀", index: 0, isWordLike: true },
  { text: "行", index: 1, isWordLike: true },
];

function renderCantonese(romanizationOverride?: string) {
  return renderToStaticMarkup(
    <ReaderTextArea
      segments={splitBankSegments}
      showPinyin={false}
      showJyutping
      showEnglish={false}
      translationMode="proper"
      fontSize={18}
      language="zh-HK"
      onSpeakSentence={() => {}}
      isSpeaking={false}
      speakingText={null}
      translationCache={new Map()}
      onTranslationFetched={() => {}}
      romanizationOverride={romanizationOverride}
    />,
  );
}

describe("ReaderTextArea Cantonese romanisation", () => {
  it("keeps the full-entry reading after rendering splits the word", () => {
    const html = renderCantonese();

    expect(html).toContain("ngan4");
    expect(html).toContain("hong4");
    expect(html).not.toContain("haang4");
  });

  it("shows a saved manual override immediately", () => {
    const html = renderCantonese("ngan4 haang4");

    expect(html).toContain("ngan4");
    expect(html).toContain("haang4");
    expect(html).not.toContain("hong4");
  });
});
