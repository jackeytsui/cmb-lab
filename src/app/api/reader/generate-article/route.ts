import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const HSK_LEVELS: Record<string, string> = {
  "1": "HSK 1 (absolute beginner). Use only the simplest, most common words (about 150 words). Very short sentences. Topics: greetings, numbers, family, food, time.",
  "2": "HSK 2 (elementary). Simple vocabulary (about 300 words). Short sentences with basic grammar. Topics: daily life, shopping, weather, hobbies.",
  "3": "HSK 3 (intermediate). Moderate vocabulary (about 600 words). Use compound sentences and basic connectors. Topics: travel, work, health, culture.",
  "4": "HSK 4 (upper intermediate). Broad vocabulary (about 1200 words). Complex sentences with varied grammar patterns. Topics: society, technology, education, current events.",
  "5": "HSK 5 (advanced). Rich vocabulary (about 2500 words). Sophisticated sentence structures, idioms, and literary expressions. Topics: philosophy, economics, science, arts.",
  "6": "HSK 6 (near-native). Full range of vocabulary and grammar. Use formal/literary Chinese, classical references, and nuanced expression. Any topic at native level.",
};

const SYSTEM_PROMPT = `You are a Chinese language content creator. Generate engaging, educational Chinese text articles for language learners.

Rules:
- Write ONLY in Chinese characters (simplified by default unless told otherwise)
- The article should be 150-400 characters long
- Make the content interesting and educational
- Structure with clear paragraphs
- Do NOT include pinyin, English translations, or vocabulary lists
- Just output the Chinese article text, nothing else`;

function getGenerationErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

  if (/OPENAI_API_KEY|Incorrect API key|Unauthorized|401/i.test(raw)) {
    return "OpenAI API key is missing or invalid.";
  }

  if (/insufficient_quota|quota|rate limit|429/i.test(raw)) {
    return "OpenAI quota or rate limit reached. Please try again later.";
  }

  if (/model.*not found|does not exist/i.test(raw)) {
    return "Configured AI model is unavailable.";
  }

  // Keep a concise fallback for user-facing errors.
  return "Article generation failed. Please try again.";
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { topic, level, script } = body as {
      topic: string;
      level: string;
      script?: "simplified" | "traditional";
    };

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 },
      );
    }

    if (!level || !HSK_LEVELS[level]) {
      return NextResponse.json(
        { error: "Invalid level. Use 1-6." },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const levelDesc = HSK_LEVELS[level];
    const scriptNote =
      script === "traditional"
        ? " Write in Traditional Chinese characters (繁體字)."
        : "";

    const prompt = `Write a Chinese article about: ${topic.trim()}

Difficulty level: ${levelDesc}${scriptNote}

Generate an engaging article at this exact difficulty level.`;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2048,
    });

    const article = text.trim();
    if (!article) {
      return NextResponse.json(
        { error: "Failed to generate article" },
        { status: 500 },
      );
    }

    return NextResponse.json({ article, topic: topic.trim(), level });
  } catch (error) {
    console.error("Article generation error:", error);
    return NextResponse.json(
      { error: getGenerationErrorMessage(error) },
      { status: 500 },
    );
  }
}
