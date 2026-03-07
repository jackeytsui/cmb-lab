/**
 * POST /api/reader/translate
 *
 * AI-powered Chinese-to-English sentence translation.
 * Uses OpenAI gpt-4o-mini via the Vercel AI SDK for fast,
 * cost-effective translations of reader sentences.
 *
 * Auth-protected: requires Clerk session.
 * Input: { text: string, language?: "zh-CN" | "zh-HK" } — Chinese text up to 500 characters.
 * Output: { translation: string } — English translation.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate body
    const body = await request.json();
    const { text, language } = body as { text?: string; language?: "zh-CN" | "zh-HK" };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Text is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: "Text must be 500 characters or fewer" },
        { status: 400 },
      );
    }

    // Generate translation via AI SDK
    const system =
      language === "zh-HK"
        ? "Translate the following Cantonese text to natural, fluent English. Return ONLY the English translation, nothing else. Do not include the original text."
        : "Translate the following Mandarin Chinese text to natural, fluent English. Return ONLY the English translation, nothing else. Do not include the original text.";

    const { text: translation } = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      prompt: text,
    });

    return NextResponse.json({ translation });
  } catch (error) {
    console.error("Translation API error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 },
    );
  }
}
