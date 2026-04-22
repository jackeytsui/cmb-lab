import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";
import { toSimplifiedSync } from "@/lib/chinese-convert";

/**
 * Generate romanisation for mixed Chinese/English text.
 * English words and bracketed placeholders like [your name] are kept as-is
 * (skipped) instead of being romanised letter-by-letter.
 */
export function smartRomanise(
  text: string,
  lang: "cantonese" | "mandarin",
): string {
  // Split into segments: bracketed placeholders, English words, or Chinese runs
  const segments = text.match(
    /\[[^\]]+\]|[a-zA-Z][a-zA-Z0-9' ]*[a-zA-Z0-9]|[a-zA-Z]|[^\[\]a-zA-Z]+/g,
  );
  if (!segments) return "";

  return segments
    .map((seg) => {
      // Bracketed placeholder — skip romanisation entirely
      if (/^\[/.test(seg)) return "";
      // English word(s) — skip romanisation
      if (/^[a-zA-Z]/.test(seg)) return "";
      // Chinese text — romanise
      if (lang === "cantonese") {
        const list = ToJyutping.getJyutpingList(seg);
        return list?.map(([, jp]) => jp ?? "").join(" ").trim() || "";
      }
      // Mandarin pinyin lookup is unreliable for Traditional characters with
      // multiple readings — e.g. 於 returns "wū" (classical) instead of "yú".
      // Always derive pinyin from the Simplified form (source of truth).
      return pinyin(toSimplifiedSync(seg), { toneType: "symbol" });
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}
