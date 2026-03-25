import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";

export async function POST(request: Request) {
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { text, fromLang, toLang } = body as {
    text?: string;
    fromLang?: "mandarin" | "cantonese";
    toLang?: "mandarin" | "cantonese";
  };

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }
  if (
    (fromLang !== "mandarin" && fromLang !== "cantonese") ||
    (toLang !== "mandarin" && toLang !== "cantonese") ||
    fromLang === toLang
  ) {
    return NextResponse.json(
      { error: "Invalid fromLang/toLang" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 },
    );
  }

  const fromLabel = fromLang === "mandarin" ? "Mandarin" : "Cantonese";
  const toLabel = toLang === "mandarin" ? "Mandarin" : "Cantonese";

  const systemPrompt = `Translate this ${fromLabel} Chinese text to ${toLabel} Chinese. For Cantonese use traditional characters with Cantonese-specific vocabulary (嘅 instead of 的, 喺 instead of 在, 冇 instead of 没有, etc.). For Mandarin use simplified characters with standard Mandarin vocabulary. Return ONLY the translated text, nothing else.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text.trim() },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI translate error:", err);
      return NextResponse.json(
        { error: "Translation failed" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const translated =
      data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ translated });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 },
    );
  }
}
