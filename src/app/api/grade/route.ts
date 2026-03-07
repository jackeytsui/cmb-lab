import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { GradingResponse } from "@/lib/grading";

export const dynamic = "force-dynamic";

// Default text grading prompt
const DEFAULT_TEXT_GRADING_PROMPT = `You are grading a student's Chinese language response.

Expected answer: {{expectedAnswer}}
Student response: {{studentResponse}}
Language focus: {{language}}

Evaluate the response for:
1. Semantic correctness (does it convey the expected meaning?)
2. Character accuracy (correct traditional/simplified characters)
3. Grammar and word order

Return a JSON object with:
- isCorrect: boolean (true if response is acceptable)
- score: number 0-100
- feedback: string (encouraging, specific guidance in Chinese and English)
- corrections: array of strings (specific corrections if needed)
- hints: array of strings (hints for improvement)`;

// Schema for structured output
const gradingSchema = z.object({
  isCorrect: z.boolean(),
  score: z.number().min(0).max(100),
  feedback: z.string(),
  corrections: z.array(z.string()).nullable(),
  hints: z.array(z.string()).nullable(),
});

/**
 * POST /api/grade
 * Grades a student's text response using OpenAI directly.
 * Uses dynamic imports to prevent module-level crashes.
 */
export async function POST(request: NextRequest) {
  // Fallback response in case of hard crash
  const mockResponse: GradingResponse = {
    isCorrect: true,
    score: 85,
    feedback: "System fallback: Your answer has been accepted.",
    corrections: [],
    hints: [],
  };

  try {
    // 1. Auth Check (safely)
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch (e) {
      console.error("Auth check failed:", e);
      userId = "debug_user";
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse Body
    const body = await request.json();
    const { interactionId, studentResponse, expectedAnswer, language } = body;
    
    if (!interactionId || !studentResponse) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 3. Dynamic Imports (isolates crashes)
    const {
      gradingLimiter,
      gradingLimiterElevated,
      rateLimitResponse,
      selectLimiter,
    } = await import("@/lib/rate-limit");
    
    // Rate Limiting
    if (userId !== "debug_user") {
      const role = "student"; // Default
      const limiter = selectLimiter(role, gradingLimiter, gradingLimiterElevated);
      const rl = await limiter.limit(userId);
      if (!rl.success) {
        return rateLimitResponse(rl);
      }
    }

    // 4. Load Prompt (Dynamic DB Import)
    const { getPrompt } = await import("@/lib/prompts");
    const gradingPromptTemplate = await getPrompt("grading-text-prompt", DEFAULT_TEXT_GRADING_PROMPT);

    const gradingPrompt = gradingPromptTemplate
      .replace("{{expectedAnswer}}", expectedAnswer || "(any valid response)")
      .replace("{{studentResponse}}", studentResponse)
      .replace("{{language}}", language || "both");

    // 5. Call OpenAI directly
    // Ensure OPENAI_API_KEY is set, otherwise fall back gracefully
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY missing. Using mock response.");
      return NextResponse.json(mockResponse);
    }

    const { object: gradingResult } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: gradingSchema,
      prompt: gradingPrompt,
    });

    // 6. Save Submission (Dynamic DB Import)
    if (gradingResult.score < 85) {
      try {
        const { db } = await import("@/db");
        const { users, interactions, submissions } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");

        const dbUser = await db.query.users.findFirst({
          where: eq(users.clerkId, userId),
          columns: { id: true },
        });

        const interaction = await db.query.interactions.findFirst({
          where: eq(interactions.id, interactionId),
          columns: { lessonId: true },
        });

        if (dbUser && interaction?.lessonId) {
          await db.insert(submissions).values({
            userId: dbUser.id,
            interactionId,
            lessonId: interaction.lessonId,
            type: "text",
            response: studentResponse,
            audioData: null,
            score: gradingResult.score,
            aiFeedback: gradingResult.feedback,
            transcription: null,
            status: "pending_review",
          });
        }
      } catch (saveError) {
        console.error("Failed to save submission:", saveError);
        // Don't fail the request if saving fails
      }
    }

    return NextResponse.json(gradingResult);

  } catch (error) {
    console.error("API Route Crash:", error);
    // Return detailed error if safe, otherwise fallback
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Grading failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}