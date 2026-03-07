import { NextRequest, NextResponse } from "next/server";
import { cut } from "jieba-wasm";

/**
 * POST /api/segment
 *
 * Batch Chinese word segmentation using jieba-wasm.
 * Accepts an array of strings and returns segmented word arrays.
 *
 * jieba-wasm is trained on Simplified Chinese, so Traditional Chinese
 * text is converted to Simplified before segmentation. Segment boundaries
 * are then mapped back to the original characters (1:1 character mapping).
 *
 * Body: { texts: string[] }
 * Returns: { segments: Array<Array<{ text: string, isWordLike: boolean }>> }
 */

// Lazy-loaded Traditional→Simplified converter
let toSimplified: ((text: string) => string) | null = null;

async function getSimplifiedConverter(): Promise<(text: string) => string> {
  if (!toSimplified) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const OpenCC = (await import("opencc-js")) as any;
    toSimplified = OpenCC.Converter({ from: "hk", to: "cn" }) as (t: string) => string;
  }
  return toSimplified;
}

/** Check if text contains Traditional Chinese characters */
function hasTraditional(text: string): boolean {
  // Quick heuristic: common traditional-only characters
  return /[國個這說經過對問開關點體學機氣時長門間書車東見買賣電話飛機場現實際際務設計會議環還運動員發現場實驗類開發區無為從讓認識義務際際際]/.test(text);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { texts } = body as { texts: string[] };

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "texts must be a non-empty array of strings" },
        { status: 400 }
      );
    }

    // Cap at 1000 lines to prevent abuse
    if (texts.length > 1000) {
      return NextResponse.json(
        { error: "Maximum 1000 texts per request" },
        { status: 400 }
      );
    }

    // Check if any text is Traditional Chinese — if so, load converter
    const needsConversion = texts.some((t) => hasTraditional(t));
    const convert = needsConversion ? await getSimplifiedConverter() : null;

    const segments = texts.map((text) => {
      if (!text || !text.trim()) return [];

      // Convert to simplified for jieba, keep original for output
      const simplifiedText = convert ? convert(text) : text;
      const originalChars = [...text];

      const words = cut(simplifiedText, true); // HMM enabled for unknown words

      // Map segment boundaries back to original text using character lengths
      const result: Array<{ text: string; isWordLike: boolean }> = [];
      let charOffset = 0;

      for (const word of words) {
        const wordChars = [...word];
        const len = wordChars.length;

        // Take the same number of characters from the original text
        const originalWord = originalChars.slice(charOffset, charOffset + len).join("");
        charOffset += len;

        const isWordLike = /[\p{L}\p{N}]/u.test(originalWord);
        result.push({ text: originalWord, isWordLike });
      }

      return result;
    });

    return NextResponse.json({ segments });
  } catch (error) {
    console.error("Segmentation error:", error);
    return NextResponse.json(
      { error: "Segmentation failed" },
      { status: 500 }
    );
  }
}
