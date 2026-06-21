export type FlashcardSourceType =
  | "reader"
  | "sentence"
  | "notepad"
  | "coaching"
  | "course_lesson"
  | "icgc_notes"
  | "vocabulary"
  | "other";

export type FlashcardLanguage = "mandarin" | "cantonese" | "mixed" | "unknown";

export interface FlashcardSaveInput {
  chinese: string;
  simplified?: string | null;
  pinyin?: string | null;
  jyutping?: string | null;
  english?: string | null;
  sourceLabel?: string | null;
  sourceType?: FlashcardSourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  language?: FlashcardLanguage;
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function buildFlashcardContentKey(input: FlashcardSaveInput): string {
  const chinese = normalizeValue(input.chinese);
  const simplified = normalizeValue(input.simplified);
  const pinyin = normalizeValue(input.pinyin);
  const jyutping = normalizeValue(input.jyutping);
  const language = normalizeValue(input.language ?? "unknown");
  return [language, chinese, simplified, pinyin, jyutping].join("||");
}

export function hasFlashcardText(input: FlashcardSaveInput): boolean {
  return normalizeValue(input.chinese).length > 0;
}

export function normalizeFlashcardLanguage(
  language: FlashcardLanguage | string | null | undefined,
): FlashcardLanguage {
  if (language === "mandarin" || language === "cantonese" || language === "mixed") {
    return language;
  }
  return "unknown";
}

export const FLASHCARDS_CHANGED_EVENT = "flashcards:changed";

export function notifyFlashcardsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FLASHCARDS_CHANGED_EVENT));
}
