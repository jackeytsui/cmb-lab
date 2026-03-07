import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    topic?: string;
    hskLevel?: number;
    languageHint?: string;
  };

  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_GRAMMAR_GEN_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const payload = await response.json();
        return NextResponse.json({ draft: payload.draft ?? payload });
      }
    } catch (error) {
      console.error("Grammar draft webhook failed:", error);
    }
  }

  const draft = {
    title: `${body.topic.trim()} (${body.languageHint ?? "Mandarin/Cantonese"})`,
    pattern: `Use ${body.topic.trim()} in context`,
    explanation: `<p>This draft was generated locally because no webhook response was available.</p><p>HSK target: ${body.hskLevel ?? 1}</p>`,
    examples: [
      `${body.topic.trim()} 示例 1`,
      `${body.topic.trim()} 示例 2`,
      `${body.topic.trim()} 示例 3`,
    ],
    translations: ["Example 1", "Example 2", "Example 3"],
    mistakes: ["Overusing literal translation", "Incorrect word order"],
    cantoneseDiff: "Add Cantonese-specific particle or sentence-final marker notes.",
  };

  return NextResponse.json({ draft });
}
