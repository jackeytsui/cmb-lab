import { smartRomanise } from "@/lib/romanise";
import { ensureSimplifiedConverter } from "@/lib/chinese-convert";

export type CaptionAnnotation = {
  pinyin: string;
  jyutping: string;
};

export async function generateCaptionAnnotations(
  texts: string[],
): Promise<CaptionAnnotation[]> {
  await ensureSimplifiedConverter();
  return texts.map((text) => ({
    pinyin: smartRomanise(text, "mandarin"),
    jyutping: smartRomanise(text, "cantonese"),
  }));
}

export function attachCaptionAnnotations<
  T extends { text: string },
>(
  captions: T[],
  pinyin: string[] | null | undefined,
  jyutping: string[] | null | undefined,
): Array<T & CaptionAnnotation> {
  return captions.map((caption, index) => ({
    ...caption,
    pinyin: pinyin?.[index] ?? "",
    jyutping: jyutping?.[index] ?? "",
  }));
}
