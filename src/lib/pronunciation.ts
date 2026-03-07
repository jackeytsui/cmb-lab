import type {
  PronunciationAssessmentResult,
  PronunciationWordResult,
} from "@/types/pronunciation";

// ============================================================
// Azure Speech REST API — Pronunciation Assessment Service
// ============================================================
// Calls the Azure Speech REST API to assess pronunciation of Chinese audio.
// Uses the REST API (not SDK) to avoid audio format conversion — the REST API
// accepts OGG/OPUS and WebM directly.
//
// Endpoint: https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1
// Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short

/**
 * Map browser MIME types to Azure-compatible Content-Type values.
 *
 * Azure Speech REST API accepts:
 * - audio/ogg; codecs=opus
 * - audio/webm; codecs=opus
 * - audio/wav; codecs=audio/pcm; samplerate=16000
 */
export function mapToAzureContentType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("ogg")) return "audio/ogg; codecs=opus";
  if (normalized.includes("webm")) return "audio/webm; codecs=opus";
  if (normalized.includes("wav"))
    return "audio/wav; codecs=audio/pcm; samplerate=16000";
  // Default to ogg/opus (most common browser recording format)
  return "audio/ogg; codecs=opus";
}

/**
 * Assess pronunciation using Azure Speech REST API.
 *
 * Sends audio to Azure for pronunciation assessment against a reference text.
 * For Chinese (zh-CN/zh-HK), each character is treated as a separate "word"
 * in the results — no additional splitting is needed.
 *
 * @param audioBuffer - Raw audio data from the browser recording
 * @param referenceText - The target phrase the student should have said
 * @param language - Azure locale: "zh-CN" for Mandarin, "zh-HK" for Cantonese
 * @param mimeType - Browser MIME type of the audio (e.g., "audio/webm")
 * @returns Pronunciation assessment with overall scores and per-word breakdowns
 * @throws Error if Azure credentials are missing or API call fails
 */
export async function assessPronunciation(
  audioBuffer: Buffer,
  referenceText: string,
  language: "zh-CN" | "zh-HK",
  mimeType: string
): Promise<PronunciationAssessmentResult> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("Azure Speech credentials not configured");
  }

  // Map browser MIME type to Azure-compatible Content-Type
  const contentType = mapToAzureContentType(mimeType);

  // Build pronunciation assessment config as base64-encoded JSON
  const assessmentConfig = {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: "False",
    EnableProsodyAssessment: "True",
  };
  const assessmentHeader = Buffer.from(
    JSON.stringify(assessmentConfig)
  ).toString("base64");

  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`;

  // 20-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": contentType,
        "Pronunciation-Assessment": assessmentHeader,
        Accept: "application/json",
      },
      body: new Uint8Array(audioBuffer),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Azure Speech: API error ${response.status}:`,
        errorText
      );
      throw new Error(`Pronunciation assessment failed: ${response.status}`);
    }

    const data = await response.json();
    return parseAzureResponse(data);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Azure Speech: Request timed out after 20 seconds");
      throw new Error("Pronunciation assessment timed out");
    }
    // Re-throw if it's already our error
    if (
      error instanceof Error &&
      error.message.startsWith("Pronunciation assessment")
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      error.message === "Azure Speech credentials not configured"
    ) {
      throw error;
    }
    // Log and re-throw unexpected errors
    console.error("Azure Speech: Unexpected error:", error);
    throw new Error(
      `Pronunciation assessment failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Parse the Azure Speech REST API response into our typed result.
 *
 * Azure response shape:
 * {
 *   RecognitionStatus: "Success",
 *   DisplayText: "...",
 *   NBest: [{
 *     PronunciationAssessment: { AccuracyScore, FluencyScore, CompletenessScore, PronScore, ProsodyScore },
 *     Words: [{ Word, PronunciationAssessment: { AccuracyScore, ErrorType } }]
 *   }]
 * }
 */
function parseAzureResponse(
  data: Record<string, unknown>
): PronunciationAssessmentResult {
  const nbestArray = data.NBest as Array<Record<string, unknown>> | undefined;
  const nbest = nbestArray?.[0];
  if (!nbest) {
    throw new Error("No recognition results from Azure");
  }

  const assessment = nbest.PronunciationAssessment as
    | Record<string, unknown>
    | undefined;
  const wordsArray = (nbest.Words || []) as Array<Record<string, unknown>>;

  const words: PronunciationWordResult[] = wordsArray.map((w) => {
    const wordAssessment = w.PronunciationAssessment as
      | Record<string, unknown>
      | undefined;
    return {
      word: (w.Word as string) || "",
      accuracyScore: (wordAssessment?.AccuracyScore as number) ?? 0,
      errorType:
        ((wordAssessment?.ErrorType as string) as PronunciationWordResult["errorType"]) ??
        "None",
    };
  });

  return {
    overallScore: (assessment?.PronScore as number) ?? 0,
    accuracyScore: (assessment?.AccuracyScore as number) ?? 0,
    fluencyScore: (assessment?.FluencyScore as number) ?? 0,
    completenessScore: (assessment?.CompletenessScore as number) ?? 0,
    prosodyScore: assessment?.ProsodyScore as number | undefined,
    words,
    recognizedText: (data.DisplayText as string) || "",
  };
}

/**
 * Generate human-readable feedback based on overall pronunciation score.
 */
export function generatePronunciationFeedback(
  result: PronunciationAssessmentResult
): string {
  if (result.overallScore >= 90) {
    return "Excellent pronunciation!";
  }
  if (result.overallScore >= 70) {
    return "Good pronunciation. Keep practicing the highlighted characters.";
  }
  if (result.overallScore >= 50) {
    return "Fair pronunciation. Focus on the characters marked in yellow and red.";
  }
  return "Keep practicing! Pay attention to the tone and clarity of each character.";
}
