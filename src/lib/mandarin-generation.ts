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
  return generateAnnotation(text, "mandarin");
}

/**
 * Generate romanisation (pinyin OR jyutping) + English translation for a
 * sentence, using the same pipeline as the matching 1:1 coaching input box:
 *   - mandarin:  pinyin via smartRomanise + English via zh-CN translate-batch
 *   - cantonese: jyutping via smartRomanise + English via zh-HK translate-batch
 *
 * The `pinyin` field carries jyutping for Cantonese (it maps to the same
 * generated_pinyin storage column). Throws if translation fails so callers can
 * surface a retry — an incomplete generation must not silently pass as complete.
 */
export async function generateAnnotation(
  text: string,
  language: "mandarin" | "cantonese",
): Promise<MandarinAnnotation> {
  const trimmed = text.trim();
  if (!trimmed) return { pinyin: "", english: "" };

  const pinyin = smartRomanise(trimmed, language);
  const translations = await fetchProperTranslations(
    [trimmed],
    language === "cantonese" ? "zh-HK" : "zh-CN",
  );
  const english = translations?.join(" ").trim();
  if (!english) {
    throw new Error("Translation generation failed");
  }
  return { pinyin, english };
}
