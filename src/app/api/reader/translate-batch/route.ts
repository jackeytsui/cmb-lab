import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  properBatchTranslationSystem,
  singleTranslationSystem,
  wordGlossTranslationSystem,
  type ChineseTranslationLanguage,
} from "@/lib/chinese-translation-prompts";

const MAX_SENTENCES = 50;
const MAX_WORDS = 200;
const TRANSLATION_TIMEOUT_MS = 15_000;
const OPENAI_QUOTA_CIRCUIT_MS = 5 * 60 * 1_000;

export const maxDuration = 30;

let openAiQuotaCircuitUntil = 0;

class TranslationUnavailableError extends Error {
  constructor(public readonly retryable: boolean) {
    super("Translation provider failed");
    this.name = "TranslationUnavailableError";
  }
}

function isQuotaExhaustion(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(
    `${error.message} ${"responseBody" in error ? String(error.responseBody) : ""}`,
  );
}

async function translateWithOpenAi(
  operation: () => Promise<string[]>,
): Promise<string[]> {
  if (Date.now() < openAiQuotaCircuitUntil) {
    throw new TranslationUnavailableError(false);
  }

  try {
    return await operation();
  } catch (error) {
    const quotaExhausted = isQuotaExhaustion(error);
    if (quotaExhausted) {
      openAiQuotaCircuitUntil = Date.now() + OPENAI_QUOTA_CIRCUIT_MS;
    }
    console.error("OpenAI translation failed:", error);
    throw new TranslationUnavailableError(!quotaExhausted);
  }
}

/** Strip citation markers and problematic characters from text */
function cleanText(text: string): string {
  return text
    .replace(/\[(?:註\s*)?\d+(?:[:\-]\d+)?\]/g, "") // [14], [註 6]
    .replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "") // replacement char, zero-width spaces
    .trim();
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

      const translations = await translateWithOpenAi(async () => {
        const prompt = cleaned.join("\n");
        const { text: rawResponse } = await generateText({
          model: openai("gpt-4o-mini"),
          system: wordGlossTranslationSystem(translationLanguage),
          prompt,
          maxOutputTokens: 4096,
          maxRetries: 0,
          timeout: { totalMs: TRANSLATION_TIMEOUT_MS },
        });
        const parsed = extractJsonObject(rawResponse);
        if (!parsed) throw new Error("Failed to parse OpenAI word glosses");
        const translations = cleaned.map((word) =>
          String(parsed[word] ?? "").trim(),
        );
        if (translations.some((translation) => !translation)) {
          throw new Error("OpenAI returned incomplete word glosses");
        }
        return translations;
      });

      const glosses: Record<string, string> = {};
      for (let index = 0; index < cleaned.length; index++) {
        glosses[cleaned[index]] = translations[index];
      }
      return NextResponse.json({ glosses, mode: "words", provider: "openai" });
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
    const cleanTexts = cleanedWithIndex.map((item) => item.text);
    const translations = await translateWithOpenAi(async () => {
      // Assignment inputs arrive one sentence at a time. Plain text generation
      // is both faster and more reliable for that case than asking the model to
      // satisfy an unnecessary array schema.
      if (cleanTexts.length === 1) {
        const { text: rawTranslation } = await generateText({
          model: openai("gpt-4o-mini"),
          system: singleTranslationSystem(translationLanguage),
          prompt: cleanTexts[0],
          maxOutputTokens: 4096,
          maxRetries: 0,
          timeout: { totalMs: TRANSLATION_TIMEOUT_MS },
        });
        const translation = rawTranslation.trim();
        if (!translation) {
          throw new Error("OpenAI returned an empty translation response");
        }
        return [translation];
      }

      const taggedTexts = cleanedWithIndex
        .map((item) => `<s>${item.text}</s>`)
        .join("\n");
      const { output } = await generateText({
        model: openai("gpt-4o-mini"),
        system: properBatchTranslationSystem(translationLanguage),
        prompt: taggedTexts,
        output: Output.object({
          name: "sentence_translations",
          description: `Exactly ${cleanTexts.length} English translations in source order`,
          schema: z.object({
            translations: z
              .array(z.string().trim().min(1))
              .length(cleanTexts.length),
          }),
        }),
        maxOutputTokens: 4096,
        maxRetries: 0,
        timeout: { totalMs: TRANSLATION_TIMEOUT_MS },
      });

      const translations = output.translations.map((translation) =>
        translation.trim(),
      );
      if (
        translations.length !== cleanTexts.length ||
        translations.some((translation) => !translation)
      ) {
        throw new Error("OpenAI returned an incomplete translation response");
      }
      return translations;
    });

    // Preserve original sentence indices so client mapping remains stable.
    const alignedTranslations: string[] = Array.from({ length: texts.length }, () => "");
    for (let i = 0; i < cleanedWithIndex.length; i++) {
      const targetIndex = cleanedWithIndex[i]?.index;
      if (typeof targetIndex !== "number") continue;
      alignedTranslations[targetIndex] = translations[i] ?? "";
    }

    return NextResponse.json({
      translations: alignedTranslations,
      mode: "proper",
      provider: "openai",
    });
  } catch (error) {
    console.error("Batch translation error:", error);
    if (error instanceof TranslationUnavailableError) {
      return NextResponse.json(
        {
          error: "Translation service temporarily unavailable",
          code: "translation_unavailable",
          retryable: error.retryable,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Translation failed", retryable: true },
      { status: 500 },
    );
  }
}
