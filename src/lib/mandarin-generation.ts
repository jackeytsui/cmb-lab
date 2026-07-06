import { smartRomanise } from "@/lib/romanise";

// ---------------------------------------------------------------------------
// Shared Mandarin generation pipeline.
//
// This is the exact generation logic used by the 1:1 coaching Mandarin input:
// - Pinyin is generated client-side via smartRomanise (pinyin-pro, derived
//   from the Simplified form).
// - English translation is generated via POST /api/reader/translate-batch
//   (OpenAI, "proper" sentence mode) — the same route the coaching page uses.
//
// `fetchProperTranslations` was extracted verbatim from
// CoachingMaterialClient so both the coaching page and assignment flows share
// one pipeline. Do not fork this logic — extend it here if needed.
// ---------------------------------------------------------------------------

export async function fetchProperTranslations(
  texts: string[],
  language: "zh-CN" | "zh-HK",
): Promise<string[] | null> {
  try {
    const cleanTexts = texts
      .map((t) => t.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim())
      .filter((t) => t.length > 0);
    if (cleanTexts.length === 0) return null;

    const res = await fetch("/api/reader/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: cleanTexts, mode: "proper", language }),
    });
    if (!res.ok) {
      console.error("Batch translate failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.translations ?? null;
  } catch (err) {
    console.error("Batch translate error:", err);
    return null;
  }
}

export interface MandarinAnnotation {
  pinyin: string;
  english: string;
}

/**
 * Generate pinyin + English translation for a Mandarin sentence using the
 * same pipeline as the 1:1 coaching Mandarin input box.
 *
 * Throws if the translation request fails so callers can surface a retry —
 * an incomplete generation must not silently pass as complete.
 */
export async function generateMandarinAnnotation(
  text: string,
): Promise<MandarinAnnotation> {
  const trimmed = text.trim();
  if (!trimmed) return { pinyin: "", english: "" };

  const pinyin = smartRomanise(trimmed, "mandarin");
  const translations = await fetchProperTranslations([trimmed], "zh-CN");
  const english = translations?.join(" ").trim();
  if (!english) {
    throw new Error("Translation generation failed");
  }
  return { pinyin, english };
}
