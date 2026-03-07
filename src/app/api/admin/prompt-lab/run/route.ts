import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { promptLabCases, promptLabRuns } from "@/db/schema";

async function runPrompt(prompt: string, input: string) {
  const webhookUrl = process.env.N8N_EXERCISE_GEN_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "prompt-lab", prompt, input }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const payload = await response.json();
        return payload.output ?? JSON.stringify(payload);
      }
    } catch (error) {
      console.error("Prompt lab webhook call failed:", error);
    }
  }

  return `Fallback output for input: ${input}\n\nPrompt:\n${prompt.slice(0, 400)}`;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = await hasMinimumRole("coach");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    promptA?: string;
    promptB?: string;
    input?: string;
    caseIds?: string[];
  };

  if (!body.promptA?.trim() || !body.input?.trim()) {
    return NextResponse.json({ error: "promptA and input are required" }, { status: 400 });
  }

  const [outputA, outputB] = await Promise.all([
    runPrompt(body.promptA, body.input),
    body.promptB?.trim() ? runPrompt(body.promptB, body.input) : Promise.resolve(null),
  ]);

  let passCount = 0;
  let totalCases = 0;

  if (body.caseIds?.length) {
    const cases = await db.query.promptLabCases.findMany({ where: eq(promptLabCases.userId, user.id) });
    const selected = cases.filter((c) => body.caseIds?.includes(c.id));
    totalCases = selected.length;
    passCount = selected.filter((testCase) => {
      if (!testCase.expectedPattern) return true;
      return outputA.toLowerCase().includes(testCase.expectedPattern.toLowerCase());
    }).length;
  }

  const [run] = await db
    .insert(promptLabRuns)
    .values({
      userId: user.id,
      promptA: body.promptA,
      promptB: body.promptB ?? null,
      input: body.input,
      outputA,
      outputB,
      passCount,
      totalCases,
      meta: { caseIds: body.caseIds ?? [] },
    })
    .returning();

  return NextResponse.json({ run, outputA, outputB, passCount, totalCases });
}
