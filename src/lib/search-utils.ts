import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

/**
 * Sanitize search query for safe use in SQL ILIKE patterns.
 * Escapes % and _ which are SQL wildcard characters.
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Generate pre-computed romanization search fields for Chinese text.
 * Converts Chinese characters in title/description to Pinyin and Jyutping
 * (without tones) for searchability.
 */
export function generateSearchFields(
  title: string,
  description?: string | null
): { searchPinyin: string | null; searchJyutping: string | null } {
  // Combine title and description
  const parts = [title, description].filter(Boolean);
  const combined = parts.join(" ");

  // Extract only Chinese characters
  const chineseChars = (combined.match(/[\u4e00-\u9fff]/g) || []).join("");

  if (!chineseChars) {
    return { searchPinyin: null, searchJyutping: null };
  }

  // Convert to Pinyin (no tones)
  const pinyinText = pinyin(chineseChars, {
    toneType: "none",
    type: "array",
  }).join(" ");

  // Convert to Jyutping (strip tone numbers)
  const rawJyutping = ToJyutping.getJyutpingText(chineseChars) ?? "";
  const jyutpingText = rawJyutping.replace(/[0-9]/g, "");

  return {
    searchPinyin: pinyinText.toLowerCase(),
    searchJyutping: jyutpingText.toLowerCase(),
  };
}
