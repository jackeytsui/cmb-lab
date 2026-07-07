import {
  annotateFromWords,
  annotateSentence,
  type WordToken,
} from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// Generate a space-separated pinyin model answer from Chinese text using the
// SAME jieba (/api/segment) + tone-sandhi pipeline as the 1:1 coaching page.
// One syllable per Han character, so it aligns 1:1 for the Listening Practice
// reveal. Admin-facing helper: the result pre-fills an editable field.
// ---------------------------------------------------------------------------

/** Returns "nǐ chī fàn le ma" for 你吃饭了吗. Falls back to the Intl segmenter. */
export async function generateModelPinyin(chinese: string): Promise<string> {
  const text = chinese.trim();
  if (!text) return "";

  let annotations;
  try {
    const res = await fetch("/api/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [text] }),
    });
    if (res.ok) {
      const data = await res.json();
      const words = (data.segments?.[0] ?? []) as WordToken[];
      annotations =
        Array.isArray(words) && words.length > 0
          ? annotateFromWords(words)
          : annotateSentence(text);
    } else {
      annotations = annotateSentence(text);
    }
  } catch {
    annotations = annotateSentence(text);
  }

  return annotations
    .filter((a) => a.pinyin)
    .map((a) => a.pinyin)
    .join(" ");
}

/** Count of Han characters in a string (for syllable-alignment validation). */
export function countHanCharacters(text: string): number {
  const matches = text.match(/\p{Script=Han}/gu);
  return matches ? matches.length : 0;
}
