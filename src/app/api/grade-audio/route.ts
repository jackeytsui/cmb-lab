import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { AudioGradingResponse } from "@/lib/grading";
import { db } from "@/db";
import { users, interactions, submissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPrompt } from "@/lib/prompts";
import {
  gradingLimiter,
  gradingLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";

// Default audio grading prompt (fallback if database prompt not found)
const DEFAULT_AUDIO_GRADING_PROMPT = `You are grading a student's Chinese pronunciation from an audio recording.

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
 * Capture audio submission for coach review.
 * ALL audio submissions are captured (regardless of score) - coaches want to review pronunciation.
 */
async function captureAudioSubmission(
  clerkUserId: string,
  interactionId: string,
  audioFile: File,
  gradingResult: AudioGradingResponse
) {
  try {
    // Get user database ID from Clerk ID
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
      columns: { id: true },
    });

    // Get interaction to find lessonId
    const interaction = await db.query.interactions.findFirst({
      where: eq(interactions.id, interactionId),
      columns: { lessonId: true },
    });

    if (dbUser && interaction?.lessonId) {
      // Convert audio blob to base64 for storage
      const audioBuffer = await audioFile.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString("base64");

      await db.insert(submissions).values({
        userId: dbUser.id,
        interactionId,
        lessonId: interaction.lessonId,
        type: "audio",
        response: gradingResult.transcription || "(audio submission)",
        audioData: audioBase64,
        score: gradingResult.score,
        aiFeedback: gradingResult.feedback,
        transcription: gradingResult.transcription || null,
        status: "pending_review",
      });
    }
  } catch (captureError) {
    // Log but don't fail the grading response
    console.error("Failed to capture audio submission for coach review:", captureError);
  }
}

/**
 * POST /api/grade-audio
 * Grades a student's audio recording using n8n AI webhook.
 * Returns mock response if N8N_AUDIO_GRADING_WEBHOOK_URL is not configured.
 */
export async function POST(request: NextRequest) {
  // 1. Verify user is authenticated
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

  try {
    // 2. Parse FormData (not JSON like text grading)
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const interactionId = formData.get("interactionId") as string;
    const expectedAnswer = formData.get("expectedAnswer") as string | null;
    const language = (formData.get("language") as string) || "both";

    // 3. Validate audio file exists and has content
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json(
        { error: "Missing or empty audio file" },
        { status: 400 }
      );
    }

    if (!interactionId) {
      return NextResponse.json(
        { error: "Missing required field: interactionId" },
        { status: 400 }
      );
    }

    // 4. Check if n8n webhook URL is configured
    const webhookUrl = process.env.N8N_AUDIO_GRADING_WEBHOOK_URL;
    if (!webhookUrl) {
      // Development fallback: return consistent mock response
      // This allows UI testing without n8n, but does NOT test real audio grading
      console.warn(
        "N8N_AUDIO_GRADING_WEBHOOK_URL not configured. Returning mock response. " +
          "Configure webhook for real AI grading of audio responses."
      );
      const mockResponse: AudioGradingResponse = {
        isCorrect: true,
        score: 85,
        feedback:
          "Mock response: Your pronunciation has been accepted. Configure N8N_AUDIO_GRADING_WEBHOOK_URL for real AI grading.",
        transcription: "(mock transcription)",
      };

      // Capture audio submission for coach review (even with mock)
      await captureAudioSubmission(userId, interactionId, audioFile, mockResponse);

      return NextResponse.json(mockResponse);
    }

    // 5. Load grading prompt from database (falls back to hardcoded default)
    const gradingPromptTemplate = await getPrompt("grading-audio-prompt", DEFAULT_AUDIO_GRADING_PROMPT);

    // Prepare prompt with placeholders (transcription filled by n8n after speech-to-text)
    const gradingPrompt = gradingPromptTemplate
      .replace("{{expectedAnswer}}", expectedAnswer || "(any valid response)")
      .replace("{{language}}", language);
    // Note: {{transcription}} placeholder left for n8n to fill after speech-to-text

    // 6. Build FormData for n8n webhook
    const n8nFormData = new FormData();
    n8nFormData.append("audio", audioFile);
    n8nFormData.append("interactionId", interactionId);
    n8nFormData.append("userId", userId);
    n8nFormData.append("expectedAnswer", expectedAnswer || "");
    n8nFormData.append("language", language);
    n8nFormData.append("prompt", gradingPrompt); // Include customizable prompt from database

    // 7. Call n8n webhook with 15 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        // Note: Do NOT set Content-Type for FormData - browser/fetch sets it with boundary
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
      body: n8nFormData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(`n8n audio webhook failed: ${n8nResponse.status}`);
      return NextResponse.json(
        { error: "Audio grading service unavailable" },
        { status: 502 }
      );
    }

    // 8. Parse and return grading result
    const gradingResult: AudioGradingResponse = await n8nResponse.json();

    // 9. Capture ALL audio submissions for coach review
    await captureAudioSubmission(userId, interactionId, audioFile, gradingResult);

    return NextResponse.json(gradingResult);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Audio grading request timed out" },
        { status: 504 }
      );
    }
    console.error("Audio grading API error:", error);
    return NextResponse.json(
      { error: "Failed to grade audio response" },
      { status: 500 }
    );
  }
}
