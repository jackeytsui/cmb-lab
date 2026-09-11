export const PRONUNCIATION_ISSUE_TYPES = [
  "tone",
  "initial",
  "final",
  "stress",
  "fluency",
  "other",
] as const;

export type PronunciationIssueType =
  (typeof PRONUNCIATION_ISSUE_TYPES)[number];

export const PRONUNCIATION_ISSUE_LABELS: Record<
  PronunciationIssueType,
  string
> = {
  tone: "Tone",
  initial: "Initial sound",
  final: "Final sound",
  stress: "Stress / emphasis",
  fluency: "Fluency / pacing",
  other: "Other",
};

export interface PronunciationMarkDto {
  id: string;
  startOffset: number;
  endOffset: number;
  originalText: string;
  expectedPronunciation: string;
  issueType: PronunciationIssueType;
  note: string;
  audioTimestampSeconds: number | null;
}

export function isValidPronunciationMarkRange(
  mark: Pick<
    PronunciationMarkDto,
    "startOffset" | "endOffset" | "originalText"
  >,
  text: string,
): boolean {
  return (
    Number.isInteger(mark.startOffset) &&
    Number.isInteger(mark.endOffset) &&
    mark.startOffset >= 0 &&
    mark.endOffset > mark.startOffset &&
    mark.endOffset <= text.length &&
    text.slice(mark.startOffset, mark.endOffset) === mark.originalText
  );
}
