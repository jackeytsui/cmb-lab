import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * POST /api/video/translate-captions
 *
 * Batch translates Chinese caption texts to English using GPT-4o-mini.
 * Processes in chunks of 50 lines to stay within token limits.
 *
 * Body: { texts: string[] }
 * Returns: { translations: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "placeholder") {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { texts } = body as { texts: string[] };

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "texts must be a non-empty array" },
        { status: 400 }
      );
    }

    if (texts.length > 1000) {
      return NextResponse.json(
        { error: "Maximum 1000 texts per request" },
        { status: 400 }
      );
    }

    // Process in chunks of 50 for reliability
    const CHUNK_SIZE = 50;
    const allTranslations: string[] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);

      const numberedLines = chunk
        .map((text, idx) => `${i + idx + 1}. ${text}`)
        .join("\n");

      const { text: result } = await generateText({
        model: openai("gpt-4o-mini"),
        system: `You are a Chinese-to-English translator for video captions. Translate each numbered line from Chinese to natural English. Return ONLY the translations as a JSON array of strings, matching the input order. Keep translations concise and natural. Do not include line numbers in your output.`,
        prompt: numberedLines,
      });

      // Parse the JSON array from the response
      let translations: string[];
      try {
        // Strip markdown code fences if present
        const cleaned = result
          .replace(/^```(?:json)?\n?/gm, "")
          .replace(/\n?```$/gm, "")
          .trim();
        translations = JSON.parse(cleaned);
      } catch {
        // Fallback: split by newlines if JSON parse fails
        translations = result
          .split("\n")
          .map((line) => line.replace(/^\d+\.\s*/, "").trim())
          .filter(Boolean);
      }

      // Ensure we have the right number of translations
      while (translations.length < chunk.length) {
        translations.push("");
      }

      allTranslations.push(...translations.slice(0, chunk.length));
    }

    return NextResponse.json({ translations: allTranslations });
  } catch (error) {
    console.error("Caption translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
