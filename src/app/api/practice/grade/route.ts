import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { GradingResponse, AudioGradingResponse } from "@/lib/grading";
import { getPrompt } from "@/lib/prompts";
import {
  gradingLimiter,
  gradingLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import type { GradeResult } from "@/lib/practice-grading";
import {
  assessPronunciation,
  generatePronunciationFeedback,
} from "@/lib/pronunciation";

// Default text grading prompt for practice exercises
const DEFAULT_TEXT_GRADING_PROMPT = `You are grading a student's Chinese language response in a practice exercise.

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
- corrections: string or null (specific corrections if needed)
- hints: string or null (hints for improvement)`;

// Default audio grading prompt for practice exercises
const DEFAULT_AUDIO_GRADING_PROMPT = `You are grading a student's Chinese pronunciation from an audio recording in a practice exercise.

Expected phrase: {{expectedAnswer}}
Transcription: {{transcription}}
Language: {{language}}

Evaluate the pronunciation for:
1. Tone accuracy (critical for Cantonese/Mandarin)
2. Syllable clarity
3. Natural rhythm and flow

Return a JSON object with:
- isCorrect: boolean (true if pronunciation is acceptable)
- score: number 0-100
- feedback: string (encouraging, specific guidance)
- transcription: string (what the student actually said)`;

/**
 * POST /api/practice/grade
 *
 * Delegates AI grading for practice exercises to n8n webhooks.
 * Handles both free_text (JSON) and audio_recording (FormData) exercises.
 *
 * Content-Type determines the grading path:
 * - application/json -> free_text grading
 * - multipart/form-data -> audio_recording grading
 *
 * Key differences from /api/grade and /api/grade-audio:
 * - Does NOT require a real interactionId from the interactions table
 * - Does NOT capture to submissions table (practice attempts stored separately)
 * - Uses exerciseId as the identifier passed to n8n
 */
export async function POST(request: NextRequest) {
  // 1. Auth check
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1b. Rate limiting
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "student";
  const limiter = selectLimiter(role, gradingLimiter, gradingLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  // 2. Determine grading path based on Content-Type
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return handleAudioGrading(request, userId);
  }

  // Default to JSON/text grading
  return handleTextGrading(request, userId);
}

/**
 * Handle free_text grading via JSON body.
 * Delegates to N8N_GRADING_WEBHOOK_URL.
 */
async function handleTextGrading(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { exerciseId, studentResponse, definition } = body;

    // Validate required fields
    if (!exerciseId || !studentResponse) {
      return NextResponse.json(
        { error: "Missing required fields: exerciseId, studentResponse" },
        { status: 400 }
      );
    }

    // Check if n8n webhook URL is configured
    const webhookUrl = process.env.N8N_GRADING_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(
        "N8N_GRADING_WEBHOOK_URL not configured. Returning mock response. " +
          "Configure webhook for real AI grading of practice responses."
      );
      const mockResult: GradeResult = {
        isCorrect: true,
        score: 85,
        feedback:
          "Mock: Configure N8N_GRADING_WEBHOOK_URL for real AI grading.",
      };
      return NextResponse.json(mockResult);
    }

    // Load grading prompt from database
    const gradingPromptTemplate = await getPrompt(
      "grading-text-prompt",
      DEFAULT_TEXT_GRADING_PROMPT
    );

    // Extract expected answer from exercise definition
    const expectedAnswer = definition?.sampleAnswer || "";

    // Replace template placeholders
    const gradingPrompt = gradingPromptTemplate
      .replace("{{expectedAnswer}}", expectedAnswer || "(any valid response)")
      .replace("{{studentResponse}}", studentResponse)
      .replace("{{language}}", body.language || "both");

    // Build n8n payload
    // NOTE: Reuse interactionId field name — the n8n workflow uses it for
    // logging, not LMS lookups. This avoids modifying the n8n workflow.
    const n8nPayload = {
      interactionId: exerciseId,
      userId,
      studentResponse,
      expectedAnswer,
      language: body.language || "both",
      prompt: gradingPrompt,
    };

    // Call n8n webhook with 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
      body: JSON.stringify(n8nPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(`n8n practice grading webhook failed: ${n8nResponse.status}`);
      return NextResponse.json(
        { error: "Grading service unavailable" },
        { status: 502 }
      );
    }

    // Parse n8n response and map to GradeResult shape
    const gradingResult: GradingResponse = await n8nResponse.json();
    const result: GradeResult = {
      isCorrect: gradingResult.isCorrect,
      score: gradingResult.score,
      feedback: gradingResult.feedback,
      explanation: undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Grading request timed out" },
        { status: 504 }
      );
    }
    console.error("Practice text grading error:", error);
    return NextResponse.json(
      { error: "Failed to grade response" },
      { status: 500 }
    );
  }
}

/**
 * Handle audio_recording grading via FormData.
 * Delegates to N8N_AUDIO_GRADING_WEBHOOK_URL.
 */
async function handleAudioGrading(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const exerciseId = formData.get("exerciseId") as string;
    const targetPhrase = formData.get("targetPhrase") as string | null;
    const language = (formData.get("language") as string) || "both";

    // Validate audio file
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json(
        { error: "Missing or empty audio file" },
        { status: 400 }
      );
    }

    if (!exerciseId) {
      return NextResponse.json(
        { error: "Missing required field: exerciseId" },
        { status: 400 }
      );
    }

    // Map exercise language to Azure locale
    const azureLocale =
      language === "cantonese" ? ("zh-HK" as const) : ("zh-CN" as const);

    // Try Azure pronunciation assessment first (when configured and targetPhrase exists)
    if (
      process.env.AZURE_SPEECH_KEY &&
      process.env.AZURE_SPEECH_REGION &&
      targetPhrase
    ) {
      try {
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        const pronunciationResult = await assessPronunciation(
          audioBuffer,
          targetPhrase,
          azureLocale,
          audioFile.type || "audio/webm"
        );

        const gradeResult: GradeResult = {
          isCorrect: pronunciationResult.overallScore >= 60,
          score: pronunciationResult.overallScore,
          feedback: generatePronunciationFeedback(pronunciationResult),
          pronunciationDetails: pronunciationResult,
        };

        return NextResponse.json(gradeResult);
      } catch (error) {
        console.error(
          "Azure pronunciation assessment failed, falling back to n8n:",
          error
        );
        // Fall through to n8n
      }
    }

    // Check if n8n audio webhook URL is configured
    const webhookUrl = process.env.N8N_AUDIO_GRADING_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(
        "N8N_AUDIO_GRADING_WEBHOOK_URL not configured. Returning mock response. " +
          "Configure webhook for real AI audio grading of practice responses."
      );
      const mockResult = {
        isCorrect: true,
        score: 85,
        feedback:
          "Mock: Configure N8N_AUDIO_GRADING_WEBHOOK_URL for real AI audio grading.",
        transcription: "(mock transcription)",
      };
      return NextResponse.json(mockResult);
    }

    // Load grading prompt from database
    const gradingPromptTemplate = await getPrompt(
      "grading-audio-prompt",
      DEFAULT_AUDIO_GRADING_PROMPT
    );

    // Replace template placeholders (transcription left for n8n to fill after STT)
    const gradingPrompt = gradingPromptTemplate
      .replace("{{expectedAnswer}}", targetPhrase || "(any valid response)")
      .replace("{{language}}", language);

    // Build FormData for n8n webhook
    // NOTE: Reuse interactionId field name for n8n compatibility
    const n8nFormData = new FormData();
    n8nFormData.append("audio", audioFile);
    n8nFormData.append("interactionId", exerciseId);
    n8nFormData.append("userId", userId);
    n8nFormData.append("expectedAnswer", targetPhrase || "");
    n8nFormData.append("language", language);
    n8nFormData.append("prompt", gradingPrompt);

    // Call n8n webhook with 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        // Do NOT set Content-Type for FormData — fetch sets it with boundary
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
      body: n8nFormData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(
        `n8n practice audio grading webhook failed: ${n8nResponse.status}`
      );
      return NextResponse.json(
        { error: "Audio grading service unavailable" },
        { status: 502 }
      );
    }

    // Parse n8n response and map to GradeResult shape
    const gradingResult: AudioGradingResponse = await n8nResponse.json();
    const result = {
      isCorrect: gradingResult.isCorrect,
      score: gradingResult.score,
      feedback: gradingResult.feedback,
      explanation: undefined,
      transcription: gradingResult.transcription,
    };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Audio grading request timed out" },
        { status: 504 }
      );
    }
    console.error("Practice audio grading error:", error);
    return NextResponse.json(
      { error: "Failed to grade audio response" },
      { status: 500 }
    );
  }
}
