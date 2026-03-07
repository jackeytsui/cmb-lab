import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assessPronunciation, generatePronunciationFeedback } from "@/lib/pronunciation";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    audioBase64?: string;
    targetPhrase?: string;
    language?: "mandarin" | "cantonese";
  };

  if (!body.audioBase64 || !body.targetPhrase?.trim()) {
    return NextResponse.json({ error: "audioBase64 and targetPhrase are required" }, { status: 400 });
  }

  try {
    const result = await assessPronunciation(
      Buffer.from(body.audioBase64, "base64"),
      body.targetPhrase,
      body.language === "cantonese" ? "zh-HK" : "zh-CN",
      "audio/webm"
    );

    return NextResponse.json({
      score: result.overallScore,
      feedback: generatePronunciationFeedback(result),
      details: result,
    });
  } catch (error) {
    console.error("Tone pronunciation scoring failed:", error);
    return NextResponse.json(
      {
        score: 60,
        feedback: "Scoring service is unavailable. Try again shortly.",
        details: null,
      },
      { status: 503 }
    );
  }
}
