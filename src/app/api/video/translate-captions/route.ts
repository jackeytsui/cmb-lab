import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, videoCaptions, videoSessions } from "@/db/schema";

const CHUNK_SIZE = 50;

async function generateTranslations(texts: string[]): Promise<string[]> {
  const allTranslations: string[] = [];

  for (let offset = 0; offset < texts.length; offset += CHUNK_SIZE) {
    const chunk = texts.slice(offset, offset + CHUNK_SIZE);
    const numberedLines = chunk
      .map((text, index) => `${offset + index + 1}. ${text}`)
      .join("\n");

    const { text: result } = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "You are a Chinese-to-English translator for video captions. Translate each numbered line from Chinese to natural English. Return ONLY the translations as a JSON array of strings, matching the input order. Keep translations concise and natural. Do not include line numbers in your output.",
      prompt: numberedLines,
    });

    let translations: string[];
    try {
      const cleaned = result
        .replace(/^```(?:json)?\n?/gm, "")
        .replace(/\n?```$/gm, "")
        .trim();
      const parsed: unknown = JSON.parse(cleaned);
      if (
        !Array.isArray(parsed) ||
        parsed.some((translation) => typeof translation !== "string")
      ) {
        throw new Error("Invalid translation response");
      }
      translations = parsed;
    } catch {
      translations = result
        .split("\n")
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
    }

    while (translations.length < chunk.length) translations.push("");
    allTranslations.push(...translations.slice(0, chunk.length));
  }

  return allTranslations;
}

/**
 * Batch translate Chinese captions. When a persisted video session is supplied,
 * the first complete result is stored on that caption set and reused thereafter.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      texts?: string[];
      sessionId?: string;
    };
    const suppliedTexts = body.texts;
    let texts = suppliedTexts;
    let sessionId: string | null = null;
    let cachedTranslations: string[] | null = null;

    if (body.sessionId) {
      const user = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkUserId),
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
      }

      const session = await db.query.videoSessions.findFirst({
        where: and(
          eq(videoSessions.id, body.sessionId),
          eq(videoSessions.userId, user.id),
        ),
      });
      if (!session) {
        return NextResponse.json({ error: "Video session not found" }, { status: 404 });
      }

      const captions = await db.query.videoCaptions.findMany({
        where: eq(videoCaptions.videoSessionId, session.id),
        orderBy: [asc(videoCaptions.sequence)],
      });
      texts = captions.map((caption) => caption.text);
      sessionId = session.id;
      if (
        session.captionEnglish?.length === texts.length &&
        session.captionEnglish.every((translation) => translation.trim())
      ) {
        cachedTranslations = session.captionEnglish;
      }
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "texts must be a non-empty array" },
        { status: 400 },
      );
    }
    if (texts.length > 1000) {
      return NextResponse.json(
        { error: "Maximum 1000 texts per request" },
        { status: 400 },
      );
    }
    if (
      texts.some((text) => typeof text !== "string") ||
      texts.reduce((total, text) => total + text.length, 0) > 100_000
    ) {
      return NextResponse.json(
        { error: "texts must contain strings totalling at most 100,000 characters" },
        { status: 400 },
      );
    }
    if (cachedTranslations) {
      return NextResponse.json({
        translations: cachedTranslations,
        cached: true,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "placeholder") {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    const translations = await generateTranslations(texts);
    const complete =
      translations.length === texts.length &&
      translations.every((translation) => translation.trim());

    if (sessionId && complete) {
      await db
        .update(videoSessions)
        .set({ captionEnglish: translations })
        .where(eq(videoSessions.id, sessionId));
    }

    return NextResponse.json({ translations, cached: false });
  } catch (error) {
    console.error("Caption translation error:", error);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
