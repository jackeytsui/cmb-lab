import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  properBatchTranslationSystem,
  wordGlossTranslationSystem,
  type ChineseTranslationLanguage,
} from "@/lib/chinese-translation-prompts";

const MAX_SENTENCES = 50;
const MAX_WORDS = 200;

/** Strip citation markers and problematic characters from text */
function cleanText(text: string): string {
  return text
    .replace(/\[(?:註\s*)?\d+(?:[:\-]\d+)?\]/g, "") // [14], [註 6]
    .replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "") // replacement char, zero-width spaces
    .trim();
}

/** Extract outermost JSON array from a string, handling nested brackets properly */
function extractJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(raw.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Extract outermost JSON object from a string */
function extractJsonObject(raw: string): Record<string, string> | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(raw.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { texts, words, mode, language } = body as {
      texts?: string[];
      words?: string[];
      mode: "proper" | "words";
      language?: "zh-CN" | "zh-HK";
    };
    if (language !== undefined && language !== "zh-CN" && language !== "zh-HK") {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }
    const translationLanguage: ChineseTranslationLanguage = language ?? "zh-CN";

    // "words" mode: dictionary lookup for individual words
    if (mode === "words") {
      if (!Array.isArray(words) || words.length === 0) {
        return NextResponse.json(
          { error: "words must be a non-empty array" },
          { status: 400 },
        );
      }
      if (words.length > MAX_WORDS) {
        return NextResponse.json(
          { error: `Maximum ${MAX_WORDS} words per request` },
          { status: 400 },
        );
      }

      const cleaned = words
        .map((w) => cleanText(w))
        .filter((w) => w.length > 0);
      if (cleaned.length === 0) {
        return NextResponse.json({ glosses: {}, mode: "words" });
      }

      const prompt = cleaned.join("\n");
      const { text: rawResponse } = await generateText({
        model: openai("gpt-4o-mini"),
        system: wordGlossTranslationSystem(translationLanguage),
        prompt,
        maxOutputTokens: 4096,
      });

      const parsed = extractJsonObject(rawResponse);
      if (!parsed) {
        console.error("Failed to parse word glosses JSON:", rawResponse.slice(0, 500));
        return NextResponse.json(
          { error: "Failed to parse word glosses" },
          { status: 500 },
        );
      }

      // Ensure all values are strings
      const glosses: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        glosses[k] = String(v);
      }
      return NextResponse.json({ glosses, mode: "words" });
    }

    // "proper" mode: natural sentence translation
    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "texts must be a non-empty array" },
        { status: 400 },
      );
    }

    if (texts.length > MAX_SENTENCES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SENTENCES} texts per request` },
        { status: 400 },
      );
    }

    const cleanedWithIndex = texts
      .map((text, index) => ({ index, text: cleanText(text) }))
      .filter((item) => item.text.length > 0);

    if (cleanedWithIndex.length === 0) {
      return NextResponse.json({ translations: [], mode: "proper" });
    }
    const taggedTexts = cleanedWithIndex
      .map((item) => `<s>${item.text}</s>`)
      .join("\n");

    const { text: rawResponse } = await generateText({
      model: openai("gpt-4o-mini"),
      system: properBatchTranslationSystem(translationLanguage),
      prompt: taggedTexts,
      maxOutputTokens: 4096,
    });

    const parsed = extractJsonArray(rawResponse);
    let translatedCleaned: string[];
    if (parsed) {
      translatedCleaned = parsed.map((t: unknown) =>
        typeof t === "string" ? t : String(t),
      );
    } else if (cleanedWithIndex.length === 1) {
      // Fallback: for single-sentence inputs (especially short phrases like
      // 关于/你好), GPT-4o-mini sometimes returns a bare string instead of a
      // JSON array. Treat the whole response as the translation.
      const fallback = rawResponse
        .trim()
        .replace(/^```(?:json)?\s*|```$/g, "")
        .replace(/^["'`\[]+|["'`\]]+$/g, "")
        .trim();
      if (!fallback) {
        console.error("Empty translation response:", rawResponse.slice(0, 500));
        return NextResponse.json(
          { error: "Failed to parse translation response" },
          { status: 500 },
        );
      }
      translatedCleaned = [fallback];
    } else {
      console.error("Failed to parse translation JSON:", rawResponse.slice(0, 500));
      return NextResponse.json(
        { error: "Failed to parse translation response" },
        { status: 500 },
      );
    }

    // Preserve original sentence indices so client mapping remains stable.
    const alignedTranslations: string[] = Array.from({ length: texts.length }, () => "");
    for (let i = 0; i < cleanedWithIndex.length; i++) {
      const targetIndex = cleanedWithIndex[i]?.index;
      if (typeof targetIndex !== "number") continue;
      alignedTranslations[targetIndex] = translatedCleaned[i] ?? "";
    }

    return NextResponse.json({ translations: alignedTranslations, mode: "proper" });
  } catch (error) {
    console.error("Batch translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 },
    );
  }
}
