import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";
import { toSimplifiedSync } from "@/lib/chinese-convert";

/**
 * Generate romanisation for mixed Chinese/English text.
 * Only Han-character runs produce syllables. English words, bracketed
 * placeholders, punctuation, and standalone numbers are intentionally omitted
 * because ModelAnnotatedSentence assigns one stored syllable to each Han
 * character. Including commas or digits would shift every later tone label.
 */
export function smartRomanise(
  text: string,
  lang: "cantonese" | "mandarin",
): string {
  const hanRuns = text.match(/\p{Script=Han}+/gu);
  if (!hanRuns) return "";

  return hanRuns
    .flatMap((run) => {
      if (lang === "cantonese") {
        const list = ToJyutping.getJyutpingList(run);
        return list?.flatMap(([, jyutping]) =>
          jyutping ? [jyutping] : [],
        ) ?? [];
      }
      // Mandarin pinyin lookup is unreliable for Traditional characters with
      // multiple readings — e.g. 於 returns "wū" (classical) instead of "yú".
      // Always derive pinyin from the Simplified form (source of truth).
      return pinyin(toSimplifiedSync(run), {
        toneType: "symbol",
        type: "array",
      });
    })
    .join(" ")
    .trim();
}
