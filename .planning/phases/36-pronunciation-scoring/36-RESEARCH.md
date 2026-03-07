# Phase 36: Pronunciation Scoring - Research

**Researched:** 2026-02-07
**Domain:** Azure Speech pronunciation assessment + voice AI conversation history
**Confidence:** HIGH

## Summary

Phase 36 adds two complementary features: (1) pronunciation scoring using Azure Speech Services for audio recording exercises, and (2) voice AI conversation history browsing with lesson-vocabulary-aware topic suggestions. The pronunciation scoring replaces the current n8n audio grading pipeline for `audio_recording` exercises with Azure's deterministic pronunciation assessment, providing per-word accuracy scores, overall accuracy/fluency/completeness scores, and error type classification. The voice AI features extend the existing conversation system (Phase 8) with a student-facing history browser and vocabulary-aware suggestions.

The codebase is well-positioned. The `AudioRecordingRenderer` already captures audio blobs via `useAudioRecorder`. The `usePracticePlayer` hook routes `audio_recording` exercises through `/api/practice/grade` with FormData. The `conversations` schema and `/api/conversations` CRUD already exist. The `my-conversations` page already lists past conversations with expandable transcripts. The `lesson-context.ts` already builds vocabulary-aware instructions for the voice AI.

**Primary recommendation:** Use the `microsoft-cognitiveservices-speech-sdk` npm package server-side (in the `/api/practice/grade` route) to perform pronunciation assessment via the Azure Speech SDK. Process audio on the server to keep Azure credentials secure. Convert browser-recorded webm/opus audio to WAV format server-side before sending to Azure. Store per-character pronunciation results in the existing `practice_attempts.results` JSONB column. For voice AI conversation features, extend the existing `my-conversations` page and modify `buildLessonInstructions` to inject vocabulary-based topic suggestions.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| microsoft-cognitiveservices-speech-sdk | 1.47.0 | Azure Speech pronunciation assessment | Already decided (STATE.md). Official Microsoft SDK. Supports zh-CN and zh-HK pronunciation assessment. Works in Node.js server-side. |
| ffmpeg (via fluent-ffmpeg or child_process) | N/A | Convert webm/opus audio to WAV PCM 16kHz mono | Azure Speech SDK `AudioConfig.fromWavFileInput` requires WAV format. Browser records webm. Alternative: use REST API which accepts OGG/OPUS directly. |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 | 19.2.3 | Per-character tone highlighting UI | Already installed |
| Framer Motion | 12.29.2 | Score reveal animations | Already installed |
| Drizzle ORM | 0.45.1 | Store/query pronunciation results | Already installed |
| date-fns | 4.1.0 | Format conversation timestamps | Already installed |
| lucide-react | 0.563.0 | Score icons, conversation icons | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Azure Speech SDK (server-side) | Azure Speech REST API (direct HTTP) | REST API accepts OGG/OPUS directly (no audio conversion needed), but limited to 30s audio. REST API requires manual base64 header encoding. SDK provides typed results. **Recommendation: Use REST API** -- simpler for short pronunciation exercises (typically <15s), avoids installing ffmpeg for audio conversion, and the REST API fully supports pronunciation assessment with the same response format. |
| Server-side pronunciation assessment | Client-side assessment via SDK in browser | Client-side exposes Azure subscription key. Server-side keeps credentials secure. Server-side adds latency but pronunciation exercises are already async (n8n). **Use server-side.** |
| New pronunciation_results table | Extend practice_attempts.results JSONB | JSONB is simpler and already exists. Pronunciation results are per-attempt, per-exercise -- fits the existing `Record<exerciseId, result>` shape. A separate table would add complexity for marginal benefit. **Use existing JSONB.** |

**Installation:**
```bash
npm install microsoft-cognitiveservices-speech-sdk
```

**Environment Variables Required:**
```
AZURE_SPEECH_KEY=<subscription-key>
AZURE_SPEECH_REGION=<region>  # e.g., eastus, westus2
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── pronunciation.ts              # Azure Speech pronunciation assessment service
├── app/
│   ├── api/practice/grade/
│   │   └── route.ts                  # MODIFIED: Add Azure pronunciation assessment path
│   └── (dashboard)/
│       ├── my-conversations/
│       │   └── page.tsx              # ALREADY EXISTS: Student conversation history
│       └── coach/
│           └── pronunciation/        # NEW: Coach pronunciation review dashboard
│               └── page.tsx
├── components/
│   └── practice/player/
│       ├── PronunciationResult.tsx    # NEW: Per-character tone accuracy display
│       └── renderers/
│           └── AudioRecordingRenderer.tsx  # EXISTING: No changes needed
├── types/
│   └── pronunciation.ts              # NEW: Type definitions for Azure response
```

### Pattern 1: Server-Side Pronunciation Assessment via REST API (Confidence: HIGH)

**What:** Send audio to Azure Speech Service REST API from the Next.js API route. The REST API accepts OGG/OPUS audio directly, avoiding the need for audio format conversion. Use the `Pronunciation-Assessment` header to enable assessment.

**When to use:** For all `audio_recording` exercise grading when Azure credentials are configured. Falls back to existing n8n grading when not configured.

**Example:**
```typescript
// src/lib/pronunciation.ts
// Source: Azure Speech REST API documentation

interface PronunciationAssessmentResult {
  overallScore: number;           // PronScore 0-100
  accuracyScore: number;          // 0-100
  fluencyScore: number;           // 0-100
  completenessScore: number;      // 0-100
  prosodyScore?: number;          // 0-100 (if enabled)
  words: PronunciationWordResult[];
}

interface PronunciationWordResult {
  word: string;
  accuracyScore: number;          // 0-100
  errorType: "None" | "Mispronunciation" | "Omission" | "Insertion" |
             "UnexpectedBreak" | "MissingBreak" | "Monotone";
}

export async function assessPronunciation(
  audioBuffer: Buffer,
  referenceText: string,
  language: "zh-CN" | "zh-HK",
  audioContentType: string  // e.g., "audio/ogg; codecs=opus" or "audio/webm"
): Promise<PronunciationAssessmentResult> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure Speech credentials not configured");

  // Build Pronunciation-Assessment header (base64-encoded JSON)
  const assessmentParams = {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: "False",
    EnableProsodyAssessment: "True",
  };
  const assessmentHeader = Buffer.from(
    JSON.stringify(assessmentParams)
  ).toString("base64");

  // Determine Content-Type for Azure
  // Azure accepts: audio/wav; codecs=audio/pcm; samplerate=16000
  //                audio/ogg; codecs=opus
  // Browser records webm or ogg -- webm needs conversion, ogg works directly
  let contentType = "audio/ogg; codecs=opus"; // default for most browsers

  const response = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": contentType,
        "Pronunciation-Assessment": assessmentHeader,
        "Accept": "application/json",
      },
      body: audioBuffer,
    }
  );

  if (!response.ok) {
    throw new Error(`Azure Speech API error: ${response.status}`);
  }

  const result = await response.json();
  // Parse and return structured result
  return parseAssessmentResult(result);
}
```

### Pattern 2: Per-Character Tone Accuracy Highlighting (Confidence: HIGH)

**What:** Map Azure's per-word accuracy scores to individual Chinese characters. Each Chinese character is effectively one "word" in Azure's response for zh-CN/zh-HK. Display each character with a color indicating pronunciation accuracy.

**When to use:** In the `PronunciationResult` component after grading completes.

**Key insight for Chinese:** In Azure Speech's pronunciation assessment for Chinese (zh-CN and zh-HK), each Chinese character is treated as a separate "word" in the results. For example, the phrase "ni hao" returns two words: "ni" and "hao". This means the per-word accuracy scores ARE the per-character scores -- no additional mapping is needed.

**Example:**
```typescript
// src/components/practice/player/PronunciationResult.tsx

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";      // correct
  if (score >= 50) return "text-yellow-400";      // close
  return "text-red-400";                           // incorrect
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-400/10";
  if (score >= 50) return "bg-yellow-400/10";
  return "bg-red-400/10";
}

// Each word from Azure maps to a character for Chinese
interface CharacterScore {
  character: string;
  accuracyScore: number;
  errorType: string;
}

function PronunciationResult({ result }: { result: PronunciationAssessmentResult }) {
  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="text-center">
        <div className={`text-4xl font-bold ${getScoreColor(result.overallScore)}`}>
          {result.overallScore}
        </div>
        <p className="text-zinc-400 text-sm mt-1">Overall Score</p>
      </div>

      {/* Per-character display */}
      <div className="flex flex-wrap justify-center gap-2">
        {result.words.map((word, i) => (
          <div
            key={i}
            className={`flex flex-col items-center p-2 rounded-lg ${getScoreBgColor(word.accuracyScore)}`}
          >
            <span className={`text-2xl ${getScoreColor(word.accuracyScore)}`}>
              {word.word}
            </span>
            <span className="text-xs text-zinc-500">{word.accuracyScore}</span>
          </div>
        ))}
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <p className="text-zinc-400">Accuracy</p>
          <p className={`font-semibold ${getScoreColor(result.accuracyScore)}`}>
            {result.accuracyScore}
          </p>
        </div>
        <div>
          <p className="text-zinc-400">Fluency</p>
          <p className={`font-semibold ${getScoreColor(result.fluencyScore)}`}>
            {result.fluencyScore}
          </p>
        </div>
        <div>
          <p className="text-zinc-400">Completeness</p>
          <p className={`font-semibold ${getScoreColor(result.completenessScore)}`}>
            {result.completenessScore}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Pattern 3: Audio Format Handling (Confidence: HIGH)

**What:** The browser records audio in webm/opus or ogg/opus format (varies by browser). Azure Speech REST API accepts `audio/ogg; codecs=opus` and `audio/wav; codecs=audio/pcm; samplerate=16000`. OGG/OPUS is directly supported, and Chrome's webm/opus is compatible because webm is a container for opus codec that Azure can handle.

**When to use:** In the server-side API route when receiving the audio blob from the client.

**Critical detail:** The Azure Speech SDK's `AudioConfig.fromWavFileInput` requires WAV format, which would need conversion. However, the REST API approach accepts OGG directly, avoiding any audio conversion library. This is a strong reason to prefer the REST API over the SDK for this use case.

**Two approaches:**

1. **REST API (recommended):** Send the audio blob directly. Azure's REST API handles webm/opus and ogg/opus natively with `Content-Type: audio/ogg; codecs=opus`. For Safari's mp4 recordings, the REST API also supports it.

2. **SDK approach (if REST doesn't work):** Install `microsoft-cognitiveservices-speech-sdk`, use `AudioConfig.fromWavFileInput()`, but this requires converting the browser audio to WAV first. Would need ffmpeg or a WASM-based converter.

### Pattern 4: Extending Practice Grade Route (Confidence: HIGH)

**What:** Modify the existing `/api/practice/grade` route to use Azure pronunciation assessment instead of n8n for `audio_recording` exercises when Azure credentials are configured. Keep n8n as fallback.

**When to use:** When `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set.

**Example:**
```typescript
// In /api/practice/grade route.ts handleAudioGrading function

async function handleAudioGrading(request: NextRequest, userId: string) {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File;
  const exerciseId = formData.get("exerciseId") as string;
  const targetPhrase = formData.get("targetPhrase") as string;
  const language = formData.get("language") as string || "both";

  // Map language to Azure locale
  const azureLocale = language === "cantonese" ? "zh-HK"
    : language === "mandarin" ? "zh-CN"
    : "zh-CN"; // default to Mandarin for "both"

  // Try Azure pronunciation assessment first
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const pronunciationResult = await assessPronunciation(
      audioBuffer, targetPhrase, azureLocale, audioFile.type
    );

    return NextResponse.json({
      isCorrect: pronunciationResult.overallScore >= 60,
      score: pronunciationResult.overallScore,
      feedback: generatePronunciationFeedback(pronunciationResult),
      pronunciationDetails: pronunciationResult, // full per-word scores
    });
  }

  // Fallback to n8n audio grading
  // ... existing n8n code ...
}
```

### Pattern 5: Storing Pronunciation Results (Confidence: HIGH)

**What:** Store pronunciation assessment details in the existing `practice_attempts.results` JSONB column. The column already stores `Record<exerciseId, { score, isCorrect, response }>`. Extend the shape to include `pronunciationDetails` for audio exercises.

**When to use:** When saving attempt results for audio recording exercises.

**Schema compatibility:** No migration needed. The JSONB column is schema-less. The `response` field already stores arbitrary data. Add `pronunciationDetails` alongside.

```typescript
// Extended result shape for audio exercises
{
  [exerciseId]: {
    score: number;
    isCorrect: boolean;
    response: string;  // "audio" or transcript
    pronunciationDetails?: {
      overallScore: number;
      accuracyScore: number;
      fluencyScore: number;
      completenessScore: number;
      words: { word: string; accuracyScore: number; errorType: string }[];
    };
  }
}
```

### Pattern 6: Voice AI Conversation History (Confidence: HIGH)

**What:** PRON-04 and PRON-05 extend existing functionality. The `my-conversations` page already shows conversation history with expandable transcripts. PRON-05 (vocabulary-based topic suggestions) requires injecting lesson vocabulary into the voice AI system prompt, which `buildLessonInstructions` already does.

**Analysis of existing state:**
- PRON-04 (browse past conversations): The `/my-conversations` page ALREADY exists and shows conversation cards with expandable transcripts, lesson context, and duration. This requirement may already be satisfied by the existing implementation.
- PRON-05 (vocabulary-based suggestions): The `buildLessonInstructions` function ALREADY injects lesson vocabulary and includes instructions for the AI to reference lesson content. The current voice AI system prompt already says "Reference the lesson vocabulary naturally in conversation." This may also be mostly satisfied.

**What might still be needed:** The existing page is client-rendered (fetches from `/api/conversations`). It might need server-rendering for better UX, or additional filtering/search capabilities. The voice AI could benefit from a more explicit "practice topics" section in its prompt based on specific vocabulary items rather than generic guidance.

### Anti-Patterns to Avoid

- **Client-side Azure SDK:** Never expose Azure subscription keys in the browser. Always call Azure from the server-side API route.
- **Installing ffmpeg for audio conversion:** Avoid this heavyweight dependency. Use the REST API which accepts OGG/OPUS directly, or if needed use a lightweight WASM converter.
- **Creating a separate pronunciation_results table:** Overengineering. Use the existing JSONB column in practice_attempts.
- **Blocking on audio conversion:** If conversion IS needed, do it server-side asynchronously within the API route -- the client is already waiting during "grading" state.
- **Hardcoding score thresholds:** The green/yellow/red thresholds (80/50) should be configurable or at least defined as constants, not inline magic numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pronunciation scoring | Custom ML model or whisper-based scoring | Azure Speech Pronunciation Assessment | Already decided. Industry-standard, supports zh-CN and zh-HK, returns per-word scores with error types. |
| Audio format detection | Parse audio headers manually | Browser's `audioFile.type` / `Blob.type` | The browser knows the recording format; Azure REST API accepts multiple formats. |
| Tone accuracy classification | Custom tone detection algorithm | Azure's per-word `AccuracyScore` with thresholds | Azure already evaluates tone accuracy for Chinese. Map score to green/yellow/red. |
| Conversation history UI | New conversation list component | Existing `my-conversations` page + `ConversationTranscript` | Already built in Phase 8. Extend rather than rebuild. |
| Vocabulary extraction | Custom NLP parsing | Existing `interactions` table query in `lesson-context.ts` | Lesson vocabulary is already structured as interaction prompts/expectedAnswers. |

**Key insight:** Most of PRON-04 and PRON-05 are already implemented. The `my-conversations` page shows conversation history, and `buildLessonInstructions` already provides vocabulary context to the voice AI. The main new work is PRON-01/02/03 (pronunciation scoring) and PRON-06 (coach review dashboard).

## Common Pitfalls

### Pitfall 1: Audio Format Mismatch with Azure
**What goes wrong:** Azure Speech REST API returns 400 when the Content-Type header doesn't match the actual audio format. Browser records in webm/opus (Chrome/Firefox) or mp4 (Safari).
**Why it happens:** The browser's MIME type (e.g., `audio/webm;codecs=opus`) doesn't map directly to Azure's expected Content-Type header values.
**How to avoid:** Map browser MIME types to Azure-compatible Content-Type values:
- `audio/webm;codecs=opus` or `audio/webm` -> send as `audio/webm; codecs=opus` (Azure supports this)
- `audio/ogg;codecs=opus` -> send as `audio/ogg; codecs=opus`
- `audio/mp4` -> may need conversion to WAV or use SDK approach
**Warning signs:** 400 Bad Request from Azure, "UnsupportedAudioFormat" errors.

### Pitfall 2: Chinese "Words" Are Characters, Not English-Style Words
**What goes wrong:** Developer assumes Azure returns multi-character Chinese words and tries to split them into characters. Actually, each Chinese character is already returned as a separate "word."
**Why it happens:** English word = multiple letters, Chinese word = usually 1-2 characters. Azure treats each character separately for zh-CN/zh-HK.
**How to avoid:** Directly use the `Words` array from Azure. Each entry corresponds to one Chinese character. The mapping is 1:1 -- no splitting needed.
**Warning signs:** Duplicate characters in display, wrong character count.

### Pitfall 3: Language Mapping for "both" Preference
**What goes wrong:** When the exercise language is "both", the code doesn't know whether to use zh-CN or zh-HK for Azure assessment.
**Why it happens:** Azure requires a specific locale, not a "both" option. The pronunciation scoring engine is language-specific because tones differ between Mandarin and Cantonese.
**How to avoid:** Default "both" to zh-CN (Mandarin) for pronunciation scoring, matching the project's existing convention ("Both" language preference defaults to Mandarin pinyin font in PhoneticText component -- from STATE.md). Alternatively, look at the exercise's definition context to determine the target language. Document this behavior.
**Warning signs:** Wrong tone expectations applied to Cantonese recordings, or vice versa.

### Pitfall 4: Azure REST API 30-Second Limit
**What goes wrong:** Long recordings (>30s) get rejected by the REST API with a timeout or error.
**Why it happens:** The REST API for short audio has a 30-second limit. The SDK continuous mode handles longer audio.
**How to avoid:** The existing `useAudioRecorder` hook already has a `MAX_RECORDING_DURATION = 60` seconds cap. For pronunciation exercises (reading a target phrase), recordings should be <15 seconds. Add a shorter max duration for pronunciation exercises (e.g., 30 seconds) or validate in the API route and return a helpful error.
**Warning signs:** Timeout errors from Azure, inconsistent results for long recordings.

### Pitfall 5: Missing Pronunciation Result in GradeResult Shape
**What goes wrong:** The existing `GradeResult` type from `practice-grading.ts` has { isCorrect, score, feedback, explanation }. Pronunciation details (per-word scores) don't fit this shape.
**Why it happens:** The type was designed for deterministic grading, not rich pronunciation data.
**How to avoid:** Extend the API response to include `pronunciationDetails` alongside the standard GradeResult fields. The client already handles arbitrary response shapes. The `PronunciationResult` component reads the extended data. Update the `usePracticePlayer` handleSubmit to store and pass through the pronunciation details.
**Warning signs:** Pronunciation data lost between API and UI, per-character display not rendering.

### Pitfall 6: Coach Review Dashboard Query Complexity
**What goes wrong:** Querying all pronunciation results across all students and practice sets requires joining practice_attempts with users, practice_sets, and practice_exercises, then extracting JSONB nested data.
**Why it happens:** Pronunciation details are stored inside a nested JSONB structure (attempts.results[exerciseId].pronunciationDetails).
**How to avoid:** For the coach review page, query practice_attempts with user and set joins, then parse the JSONB on the application side (not SQL). Keep the query simple -- fetch attempts, iterate in JS to extract pronunciation details. For filtering, use SQL on the top-level `score` column.
**Warning signs:** Slow queries, complex SQL with JSONB operators.

## Code Examples

### Example 1: Azure Speech REST API Pronunciation Assessment
```typescript
// src/lib/pronunciation.ts
// Source: Azure Speech REST API docs (learn.microsoft.com)

export interface PronunciationWordResult {
  word: string;
  accuracyScore: number;
  errorType: string;
}

export interface PronunciationAssessmentResult {
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  prosodyScore?: number;
  words: PronunciationWordResult[];
  recognizedText: string;
}

/**
 * Assess pronunciation using Azure Speech REST API.
 * Accepts audio in OGG/OPUS or WAV format.
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": contentType,
      "Pronunciation-Assessment": assessmentHeader,
      Accept: "application/json",
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Azure Speech API error ${response.status}:`, errorText);
    throw new Error(`Pronunciation assessment failed: ${response.status}`);
  }

  const data = await response.json();
  return parseAzureResponse(data);
}

function mapToAzureContentType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("ogg")) return "audio/ogg; codecs=opus";
  if (normalized.includes("webm")) return "audio/webm; codecs=opus";
  if (normalized.includes("wav")) return "audio/wav; codecs=audio/pcm; samplerate=16000";
  // Default to ogg/opus
  return "audio/ogg; codecs=opus";
}

function parseAzureResponse(data: any): PronunciationAssessmentResult {
  const nbest = data.NBest?.[0];
  if (!nbest) {
    throw new Error("No recognition results from Azure");
  }

  const assessment = nbest.PronunciationAssessment;
  const words: PronunciationWordResult[] = (nbest.Words || []).map(
    (w: any) => ({
      word: w.Word,
      accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
      errorType: w.PronunciationAssessment?.ErrorType ?? "None",
    })
  );

  return {
    overallScore: assessment?.PronScore ?? 0,
    accuracyScore: assessment?.AccuracyScore ?? 0,
    fluencyScore: assessment?.FluencyScore ?? 0,
    completenessScore: assessment?.CompletenessScore ?? 0,
    prosodyScore: assessment?.ProsodyScore,
    words,
    recognizedText: data.DisplayText || "",
  };
}
```

### Example 2: Modified Practice Grade Route for Pronunciation
```typescript
// In /api/practice/grade/route.ts -- handleAudioGrading modification
// Source: Codebase pattern from existing handleAudioGrading

import { assessPronunciation } from "@/lib/pronunciation";

async function handleAudioGrading(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File | null;
  const exerciseId = formData.get("exerciseId") as string;
  const targetPhrase = formData.get("targetPhrase") as string | null;
  const language = (formData.get("language") as string) || "both";

  if (!audioFile || audioFile.size === 0 || !exerciseId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Map exercise language to Azure locale
  const azureLocale = language === "cantonese" ? "zh-HK" : "zh-CN";

  // Try Azure pronunciation assessment
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION && targetPhrase) {
    try {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      const result = await assessPronunciation(
        audioBuffer,
        targetPhrase,
        azureLocale,
        audioFile.type || "audio/webm"
      );

      const gradeResult = {
        isCorrect: result.overallScore >= 60,
        score: result.overallScore,
        feedback: generateFeedback(result),
        pronunciationDetails: result,
      };

      return NextResponse.json(gradeResult);
    } catch (error) {
      console.error("Azure pronunciation assessment failed:", error);
      // Fall through to n8n fallback
    }
  }

  // Fallback to n8n audio grading (existing code)
  // ...
}

function generateFeedback(result: PronunciationAssessmentResult): string {
  if (result.overallScore >= 90) return "Excellent pronunciation!";
  if (result.overallScore >= 70) return "Good pronunciation. Keep practicing the highlighted characters.";
  if (result.overallScore >= 50) return "Fair pronunciation. Focus on the characters marked in yellow and red.";
  return "Keep practicing! Pay attention to the tone and clarity of each character.";
}
```

### Example 3: Extended GradeResult for Pronunciation Data
```typescript
// Extended result shape flowing through usePracticePlayer
// Source: Codebase pattern from src/lib/practice-grading.ts

// Existing GradeResult (unchanged)
interface GradeResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  explanation?: string;
}

// Extended result from API for audio exercises
interface AudioGradeResult extends GradeResult {
  pronunciationDetails?: {
    overallScore: number;
    accuracyScore: number;
    fluencyScore: number;
    completenessScore: number;
    words: { word: string; accuracyScore: number; errorType: string }[];
    recognizedText: string;
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| n8n webhook for all audio grading | Azure Speech pronunciation assessment for structured exercises | Phase 36 | Deterministic scoring with per-character accuracy; n8n remains for free-form audio |
| Generic AI-based audio feedback | Per-word accuracy scores with green/yellow/red highlighting | Phase 36 | Visual, actionable feedback for language learners |
| No pronunciation-specific results storage | JSONB pronunciation details in practice_attempts | Phase 36 | Coaches can review per-character pronunciation accuracy |

**Deprecated/outdated:**
- The n8n audio grading webhook is NOT deprecated -- it remains the fallback when Azure is not configured, and is still used for free-text audio exercises. Only `audio_recording` exercises with a defined `targetPhrase` use Azure pronunciation assessment.

## Open Questions

1. **Audio format compatibility with Azure REST API for webm**
   - What we know: Azure REST API officially supports WAV (PCM) and OGG (OPUS). Browser records webm/opus (Chrome/Firefox) or mp4 (Safari). The underlying codec is usually OPUS in both webm and ogg containers.
   - What's unclear: Does Azure REST API accept `audio/webm; codecs=opus` directly, or does it require the ogg container? Some reports suggest Azure handles webm with opus codec, but this is not explicitly documented.
   - Recommendation: Test with actual browser-recorded webm audio during implementation. If webm fails, convert to WAV server-side using a lightweight approach (e.g., Node.js WASM-based library like `audiobuffer-to-wav`) or switch to the SDK approach which handles format internally. This should be validated in the first implementation task.

2. **"Both" language default for pronunciation scoring**
   - What we know: When exercise language is "both", we need a single Azure locale.
   - What's unclear: Should we always default to zh-CN, or should the exercise definition include a more specific pronunciation target?
   - Recommendation: Default to zh-CN (Mandarin) matching the existing project convention. The AudioRecordingDefinition could be extended with an optional `pronunciationLocale` field for exercises that specifically target Cantonese, but this is an enhancement, not a blocker.

3. **Prosody score availability for zh-HK**
   - What we know: Prosody assessment was added more recently. It's available for many languages but the exact list for zh-HK is not confirmed in the docs we reviewed.
   - What's unclear: Whether `EnableProsodyAssessment: "True"` works for zh-HK or only zh-CN.
   - Recommendation: Enable it and handle gracefully if the prosodyScore comes back as undefined. The UI should display it only when present.

## Sources

### Primary (HIGH confidence)
- Azure Speech Pronunciation Assessment API docs (Context7 `/websites/learn_microsoft_en-us_azure_ai-services_speech-service`) -- REST API format, response shape, language support
- Azure Speech SDK JavaScript samples (Context7 `/azure-samples/cognitive-services-speech-sdk`) -- Node.js pronunciation assessment code patterns
- [Azure Speech REST API for short audio](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short) -- REST API headers, Content-Type, Pronunciation-Assessment header format
- [PronunciationAssessmentConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/pronunciationassessmentconfig) -- SDK configuration options
- [PronunciationAssessmentResult class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/pronunciationassessmentresult) -- SDK result properties
- Direct codebase analysis of `src/app/api/practice/grade/route.ts` -- existing audio grading flow
- Direct codebase analysis of `src/hooks/useAudioRecorder.ts` -- browser audio recording format
- Direct codebase analysis of `src/lib/audio-utils.ts` -- MIME type detection
- Direct codebase analysis of `src/db/schema/practice.ts` -- practice_attempts JSONB results column
- Direct codebase analysis of `src/db/schema/conversations.ts` -- conversation schema
- Direct codebase analysis of `src/app/(dashboard)/my-conversations/page.tsx` -- existing conversation history UI
- Direct codebase analysis of `src/app/(dashboard)/coach/conversations/` -- existing coach conversation review
- Direct codebase analysis of `src/hooks/useRealtimeConversation.ts` -- WebRTC voice AI flow
- Direct codebase analysis of `src/lib/lesson-context.ts` -- vocabulary-aware AI instructions
- Direct codebase analysis of `src/hooks/usePracticePlayer.ts` -- player state and grading flow
- Direct codebase analysis of `src/types/exercises.ts` -- AudioRecordingDefinition type

### Secondary (MEDIUM confidence)
- [Azure Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) -- zh-CN and zh-HK confirmed for pronunciation assessment
- [microsoft-cognitiveservices-speech-sdk npm](https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk) -- SDK version 1.47.0
- `.planning/STATE.md` -- decision to use microsoft-cognitiveservices-speech-sdk

### Tertiary (LOW confidence)
- WebSearch results on Azure webm format support -- not officially documented but community reports suggest it works
- WebSearch results on zh-HK prosody assessment -- not explicitly confirmed in documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Azure Speech SDK already decided, API documented, codebase patterns clear
- Architecture: HIGH -- REST API approach verified against docs, codebase integration points identified, existing patterns reusable
- Pitfalls: HIGH -- audio format, Chinese character mapping, language defaults all identified from docs + code analysis
- PRON-04/05 (conversation features): HIGH -- existing code already covers most requirements, minimal new work needed

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (Azure Speech API stable, no major breaking changes expected)
