# Phase 6: Audio Interactions - Research

**Researched:** 2026-01-27
**Domain:** Browser Audio Recording (MediaRecorder API), Cross-Browser Compatibility, AI Pronunciation Grading
**Confidence:** HIGH

## Summary

Phase 6 extends the existing text interaction system to support audio recording for pronunciation exercises. This research covers three primary domains:

1. **Cross-Browser Audio Recording**: The MediaRecorder API is now widely supported (Baseline since April 2021), but Safari/iOS has specific MIME type requirements. The key challenge is detecting supported formats at runtime and handling format differences gracefully. Safari prefers `audio/mp4` while Chrome/Firefox prefer `audio/webm`.

2. **Audio Upload to n8n Webhook**: Audio must be sent as multipart/form-data with the blob properly named. The existing `/api/grade` endpoint pattern can be extended to `/api/grade/audio` which forwards audio files to n8n. The n8n webhook receives binary data and can process it with OpenAI Whisper or other transcription services.

3. **AI Pronunciation Grading**: Multiple options exist for grading pronunciation. The most practical approach for Chinese is using OpenAI's gpt-4o-transcribe for accurate transcription, then comparing the transcription against the expected answer. More sophisticated phoneme-level analysis is available through Azure Speech Services (supports zh-CN and zh-HK) or specialized APIs like SpeechSuper.

**Primary recommendation:** Use native MediaRecorder API with runtime MIME type detection (no external library needed), upload audio as FormData to an API route that forwards to n8n, and implement AI grading via transcription comparison with optional pronunciation scoring.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MediaRecorder API | Native | Audio recording | Built into all modern browsers, no dependencies |
| FormData API | Native | File upload | Standard way to upload blobs |
| Existing React patterns | N/A | State management | Use existing form/submission patterns from TextInteraction |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `recordrtc` | ^5.6.x | Fallback recording | Only if MediaRecorder proves insufficient |
| OpenAI Whisper API | gpt-4o-transcribe | Transcription | Via n8n for speech-to-text |
| Azure Speech Services | Current | Pronunciation assessment | Optional: phoneme-level feedback for zh-CN/zh-HK |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native MediaRecorder | RecordRTC library | RecordRTC adds ~50KB, handles more edge cases but native API is sufficient |
| Custom React hook | @wmik/use-media-recorder | External hook adds dependency; custom hook gives full control |
| Whisper transcription | Azure Pronunciation Assessment | Azure gives phoneme-level scoring but adds vendor lock-in |
| Single API route | Separate routes for text/audio | Single route with type discrimination is cleaner |

**Installation:**
```bash
# No new packages required for core functionality
# Native MediaRecorder API is sufficient

# Optional: If RecordRTC fallback needed
npm install recordrtc
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── interactions/
│       ├── AudioInteraction.tsx     # Main audio recording interaction
│       ├── AudioRecorder.tsx        # Recording UI with waveform (optional)
│       ├── AudioPlayback.tsx        # Playback before submit
│       └── useAudioRecorder.ts      # Custom hook for MediaRecorder
├── app/
│   └── api/
│       └── grade/
│           ├── route.ts             # Existing text grading (unchanged)
│           └── audio/
│               └── route.ts         # Audio grading route
└── lib/
    ├── grading.ts                   # Extended with audio types
    └── audio.ts                     # Audio format detection utilities
```

### Pattern 1: MIME Type Detection for Cross-Browser Support
**What:** Detect supported audio formats at runtime before recording
**When to use:** Before initializing MediaRecorder
**Example:**
```typescript
// Source: MDN MediaRecorder.isTypeSupported + community best practices
// src/lib/audio.ts

/**
 * MIME types in priority order.
 * Safari/iOS prefers mp4, Chrome/Firefox prefer webm.
 */
const MIME_TYPE_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/wav",
];

/**
 * File extensions for each MIME type
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/webm;codecs=opus": ".webm",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/ogg;codecs=opus": ".ogg",
  "audio/wav": ".wav",
};

/**
 * Detect the best supported audio MIME type for this browser.
 * Returns first supported type from priority list, or null if none supported.
 */
export function detectSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

/**
 * Get file extension for a MIME type.
 */
export function getExtensionForMimeType(mimeType: string): string {
  // Strip codec suffix if present
  const baseMimeType = mimeType.split(";")[0];
  return MIME_TO_EXTENSION[mimeType] ?? MIME_TO_EXTENSION[baseMimeType] ?? ".audio";
}

/**
 * Check if audio recording is supported in this browser.
 */
export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined" &&
    detectSupportedMimeType() !== null
  );
}
```

### Pattern 2: Custom useAudioRecorder Hook
**What:** React hook encapsulating MediaRecorder state and lifecycle
**When to use:** In AudioInteraction component
**Example:**
```typescript
// Source: Native MediaRecorder API + React patterns
// src/components/interactions/useAudioRecorder.ts

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { detectSupportedMimeType, getExtensionForMimeType } from "@/lib/audio";

export type RecordingState = "idle" | "requesting" | "recording" | "paused" | "stopped";

export interface AudioRecorderResult {
  blob: Blob | null;
  url: string | null;
  mimeType: string;
  extension: string;
}

export interface UseAudioRecorderReturn {
  /** Current recording state */
  state: RecordingState;
  /** Recording duration in seconds */
  duration: number;
  /** Recording result (available after stop) */
  result: AudioRecorderResult | null;
  /** Error message if any */
  error: string | null;
  /** Whether audio recording is supported */
  isSupported: boolean;
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording */
  stopRecording: () => void;
  /** Reset to initial state */
  reset: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [result, setResult] = useState<AudioRecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mimeTypeRef = useRef<string>("");

  const isSupported = typeof window !== "undefined" && isAudioRecordingSupported();

  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    // Revoke previous URL
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
  }, [result?.url]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError("Audio recording is not supported in this browser");
      return;
    }

    setError(null);
    setState("requesting");

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Detect supported MIME type
      const mimeType = detectSupportedMimeType();
      if (!mimeType) {
        throw new Error("No supported audio format found");
      }
      mimeTypeRef.current = mimeType;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Handle data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setResult({
          blob,
          url,
          mimeType,
          extension: getExtensionForMimeType(mimeType),
        });
        setState("stopped");
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        setError("Recording error occurred");
        setState("idle");
        cleanup();
      };

      // Start recording
      mediaRecorder.start();
      setState("recording");

      // Start duration timer
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setError("Microphone permission denied. Please allow microphone access.");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found. Please connect a microphone.");
        } else {
          setError(`Failed to access microphone: ${err.message}`);
        }
      } else {
        setError("Failed to start recording");
      }
      setState("idle");
      cleanup();
    }
  }, [isSupported, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
      // Timer cleanup happens in onstop handler via setState
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Stop stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  }, [state]);

  const reset = useCallback(() => {
    cleanup();
    setResult(null);
    setDuration(0);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, [cleanup]);

  return {
    state,
    duration,
    result,
    error,
    isSupported,
    startRecording,
    stopRecording,
    reset,
  };
}
```

### Pattern 3: AudioInteraction Component
**What:** Complete audio recording interaction form, following TextInteraction pattern
**When to use:** When video pauses for audio interaction
**Example:**
```typescript
// Source: Existing TextInteraction pattern + MediaRecorder integration
// src/components/interactions/AudioInteraction.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Mic, Square, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackDisplay } from "./FeedbackDisplay";
import { useAudioRecorder } from "./useAudioRecorder";
import type { GradingFeedback } from "@/lib/grading";

interface AudioInteractionProps {
  interactionId: string;
  prompt: string;
  expectedAnswer?: string;
  language: "cantonese" | "mandarin" | "both";
  onComplete: () => void;
}

export function AudioInteraction({
  interactionId,
  prompt,
  expectedAnswer,
  language,
  onComplete,
}: AudioInteractionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<GradingFeedback | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    state,
    duration,
    result,
    error,
    isSupported,
    startRecording,
    stopRecording,
    reset,
  } = useAudioRecorder();

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle playback
  const togglePlayback = () => {
    if (!audioRef.current || !result?.url) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle submission
  async function handleSubmit() {
    if (!result?.blob) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append("audio", result.blob, `recording${result.extension}`);
      formData.append("interactionId", interactionId);
      formData.append("language", language);
      if (expectedAnswer) {
        formData.append("expectedAnswer", expectedAnswer);
      }

      const response = await fetch("/api/grade/audio", {
        method: "POST",
        body: formData,
        // Note: Don't set Content-Type header - browser sets it with boundary
      });

      if (!response.ok) {
        throw new Error("Failed to grade audio");
      }

      const gradingResult: GradingFeedback = await response.json();
      setFeedback(gradingResult);

      if (gradingResult.isCorrect) {
        setTimeout(onComplete, 1500);
      }
    } catch (err) {
      console.error("Audio grading error:", err);
      setFeedback({
        isCorrect: false,
        score: 0,
        feedback: "Failed to grade your recording. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle try again
  function handleTryAgain() {
    reset();
    setFeedback(null);
  }

  // Audio playback ended handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [result?.url]);

  // Unsupported browser fallback
  if (!isSupported) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-white">{prompt}</p>
        <div className="p-4 bg-yellow-500/20 rounded-lg text-yellow-300">
          Audio recording is not supported in this browser.
          Please use a recent version of Chrome, Firefox, or Safari.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Prompt display */}
      <div className="text-xl text-white font-medium">{prompt}</div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Recording controls */}
      <div className="flex flex-col items-center gap-4">
        {state === "idle" && (
          <Button
            onClick={startRecording}
            size="lg"
            className="gap-2"
            disabled={isSubmitting}
          >
            <Mic className="h-5 w-5" />
            Start Recording
          </Button>
        )}

        {state === "requesting" && (
          <div className="text-zinc-400">Requesting microphone access...</div>
        )}

        {state === "recording" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white font-mono text-lg">
                {formatDuration(duration)}
              </span>
            </div>
            <Button
              onClick={stopRecording}
              size="lg"
              variant="destructive"
              className="gap-2"
            >
              <Square className="h-5 w-5" />
              Stop Recording
            </Button>
          </div>
        )}

        {state === "stopped" && result?.url && (
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Hidden audio element */}
            <audio ref={audioRef} src={result.url} />

            {/* Playback controls */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlayback}
                disabled={isSubmitting}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <span className="text-zinc-400 font-mono">
                {formatDuration(duration)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTryAgain}
                disabled={isSubmitting || (feedback?.isCorrect ?? false)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* Submit button */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (feedback?.isCorrect ?? false)}
              className="w-full"
            >
              {isSubmitting
                ? "Checking..."
                : feedback?.isCorrect
                  ? "Correct!"
                  : "Submit Recording"}
            </Button>
          </div>
        )}
      </div>

      {/* Animated feedback display */}
      <AnimatePresence mode="wait">
        {feedback && <FeedbackDisplay feedback={feedback} />}
      </AnimatePresence>

      {/* Try Again button after incorrect feedback */}
      {feedback && !feedback.isCorrect && state === "stopped" && (
        <Button
          variant="outline"
          onClick={handleTryAgain}
          disabled={isSubmitting}
          className="w-full"
        >
          Record Again
        </Button>
      )}
    </div>
  );
}
```

### Pattern 4: Audio Grading API Route
**What:** API route that uploads audio to n8n webhook for AI grading
**When to use:** When student submits audio recording
**Example:**
```typescript
// Source: Existing /api/grade pattern + FormData handling
// src/app/api/grade/audio/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { GradingResponse } from "@/lib/grading";

/**
 * POST /api/grade/audio
 * Grades a student's audio recording using n8n AI webhook.
 * Expects multipart/form-data with audio file.
 */
export async function POST(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Parse multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const interactionId = formData.get("interactionId") as string | null;
    const language = formData.get("language") as string | null;
    const expectedAnswer = formData.get("expectedAnswer") as string | null;

    if (!audioFile || !interactionId) {
      return NextResponse.json(
        { error: "Missing required fields: audio, interactionId" },
        { status: 400 }
      );
    }

    // 3. Check if n8n webhook URL is configured
    const webhookUrl = process.env.N8N_AUDIO_GRADING_WEBHOOK_URL;
    if (!webhookUrl) {
      // Development fallback: return mock response
      console.warn(
        "N8N_AUDIO_GRADING_WEBHOOK_URL not configured. Returning mock response."
      );
      const mockResponse: GradingResponse = {
        isCorrect: true,
        score: 85,
        feedback:
          "Mock response: Your pronunciation has been accepted. Configure N8N_AUDIO_GRADING_WEBHOOK_URL for real AI grading.",
        corrections: undefined,
        hints: undefined,
      };
      return NextResponse.json(mockResponse);
    }

    // 4. Forward to n8n webhook as multipart/form-data
    const n8nFormData = new FormData();
    n8nFormData.append("audio", audioFile);
    n8nFormData.append("userId", userId);
    n8nFormData.append("interactionId", interactionId);
    n8nFormData.append("language", language || "both");
    if (expectedAnswer) {
      n8nFormData.append("expectedAnswer", expectedAnswer);
    }

    // 5. Call n8n webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for audio

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      body: n8nFormData,
      signal: controller.signal,
      headers: {
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
    });

    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(`n8n audio webhook failed: ${n8nResponse.status}`);
      return NextResponse.json(
        { error: "Audio grading service unavailable" },
        { status: 502 }
      );
    }

    // 6. Parse and return grading result
    const gradingResult: GradingResponse = await n8nResponse.json();
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
      { error: "Failed to grade audio" },
      { status: 500 }
    );
  }
}
```

### Anti-Patterns to Avoid
- **Hardcoding MIME types**: Always use `MediaRecorder.isTypeSupported()` to detect browser capabilities
- **Setting Content-Type header on FormData**: Browser must set the boundary; manually setting it breaks upload
- **Not cleaning up MediaStream**: Always stop stream tracks and revoke blob URLs to prevent memory leaks
- **Assuming getUserMedia succeeds**: Always handle permission denied, device not found, and other errors gracefully
- **Long recording without limits**: Consider maximum recording duration (e.g., 60 seconds) to prevent massive uploads
- **Synchronous blob operations**: Use async patterns for large audio processing

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio format detection | Manual browser sniffing | `MediaRecorder.isTypeSupported()` | Browser detection is unreliable; MIME detection is authoritative |
| Permission UI | Custom permission dialog | Browser's native prompt | Browsers handle permissions; custom dialogs can't grant access |
| Audio compression | Custom encoder | Browser's MediaRecorder codecs | Native codecs are optimized and hardware-accelerated |
| Waveform visualization | Canvas drawing from scratch | Web Audio API AnalyserNode | Built-in FFT for frequency/amplitude data |
| Blob to FormData | Manual multipart construction | FormData API | FormData handles boundaries and encoding automatically |

**Key insight:** Browser audio APIs (MediaRecorder, getUserMedia, Web Audio) are mature and well-tested. Custom solutions add complexity without benefit. Focus implementation effort on the React integration and UX, not low-level audio handling.

## Common Pitfalls

### Pitfall 1: Safari Returns audio/mp4 but Sends Different Format
**What goes wrong:** Safari may report mp4 support but internal codec varies
**Why it happens:** Safari's MediaRecorder implementation has quirks
**How to avoid:** Always send MIME type along with audio file to n8n; let server handle format detection
**Warning signs:** Audio files play locally but fail on server

### Pitfall 2: iOS Safari getUserMedia Requires User Gesture
**What goes wrong:** Recording fails silently on iOS Safari
**Why it happens:** iOS requires getUserMedia to be called from user gesture (click/tap handler)
**How to avoid:** Only call `startRecording()` from direct button click handlers, not from useEffect or other async contexts
**Warning signs:** Works on desktop Safari but fails on iPhone/iPad

### Pitfall 3: MediaRecorder Memory Leak from Unreleased Streams
**What goes wrong:** Memory usage grows with each recording attempt
**Why it happens:** MediaStream tracks not stopped, blob URLs not revoked
**How to avoid:** Call `stream.getTracks().forEach(t => t.stop())` on cleanup; call `URL.revokeObjectURL()` on old URLs
**Warning signs:** Browser tab memory increasing over time, eventual slowdown

### Pitfall 4: CORS Issues with n8n Webhook
**What goes wrong:** Audio upload fails with CORS error
**Why it happens:** n8n webhook may not have CORS headers configured
**How to avoid:** Route through Next.js API route (already implemented pattern); don't call n8n directly from client
**Warning signs:** Network tab shows CORS preflight failure

### Pitfall 5: Audio Too Large for Webhook Timeout
**What goes wrong:** Long recordings time out during upload
**Why it happens:** Uncompressed or long audio files are large (1 min WAV ~ 10MB)
**How to avoid:** Limit recording duration (60s max); prefer compressed formats (webm, mp4); increase timeout to 30s
**Warning signs:** Timeouts only on longer recordings

### Pitfall 6: Permission State Not Tracked
**What goes wrong:** User previously denied permission but UI shows "Start Recording"
**Why it happens:** App doesn't check permission state before offering recording
**How to avoid:** Use Permissions API to check `navigator.permissions.query({ name: 'microphone' })` for state
**Warning signs:** Recording immediately fails without error for some users

## Code Examples

Verified patterns from official sources:

### getUserMedia with Permission Handling
```typescript
// Source: MDN Web Docs + best practices
async function requestMicrophoneAccess(): Promise<MediaStream> {
  // Check if getUserMedia is available
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia not supported");
  }

  // Check existing permission state (optional, for UX)
  if (navigator.permissions) {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "denied") {
      throw new Error("Microphone permission was denied. Please enable it in browser settings.");
    }
  }

  // Request access (this may trigger browser permission prompt)
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
```

### FormData Upload with Blob
```typescript
// Source: MDN Using FormData Objects
async function uploadAudio(blob: Blob, filename: string, metadata: Record<string, string>) {
  const formData = new FormData();

  // Append blob with filename (3rd parameter)
  formData.append("audio", blob, filename);

  // Append metadata
  for (const [key, value] of Object.entries(metadata)) {
    formData.append(key, value);
  }

  // Fetch without Content-Type header (browser sets it with boundary)
  const response = await fetch("/api/grade/audio", {
    method: "POST",
    body: formData,
    // Don't set Content-Type!
  });

  return response.json();
}
```

### n8n Webhook Audio Handling Pattern
```typescript
// Source: n8n community patterns + official docs
// n8n workflow receives:
// - Binary data in "audio" field
// - Form fields as JSON in body

// Expected n8n workflow structure:
// 1. Webhook node (receives multipart/form-data)
//    - Binary Property: "audio"
// 2. OpenAI node (transcription)
//    - Operation: Transcribe
//    - Input Data Field Name: audio
// 3. Code node (compare transcription to expected)
// 4. Respond to Webhook node (return grading result)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flash-based recording | MediaRecorder API | 2016+ | Native, no plugins required |
| Polyfills for Safari | Native Safari support | iOS 14.5 (2021) | No polyfills needed for modern Safari |
| Server-side format conversion | Browser native codecs | Always | Less server processing |
| Basic WAV recording | Opus/AAC compressed | 2020+ | 10x smaller files |
| Whisper v2 | gpt-4o-transcribe | Dec 2025 | Better accuracy, lower hallucination |

**Deprecated/outdated:**
- `navigator.getUserMedia()`: Use `navigator.mediaDevices.getUserMedia()` instead
- RecorderJS: Unmaintained, use native MediaRecorder
- Flash-based recorders: Flash is dead
- ScriptProcessorNode: Deprecated, use AudioWorkletNode (except iOS Safari workaround)

## Open Questions

Things that couldn't be fully resolved:

1. **n8n Workflow Implementation Details**
   - What we know: n8n can receive binary audio via webhook and process with OpenAI
   - What's unclear: Exact n8n workflow configuration for Chinese pronunciation grading
   - Recommendation: Build API route with mock response first; document expected n8n response format; n8n workflow can be built in parallel

2. **Pronunciation Scoring Granularity**
   - What we know: OpenAI Whisper transcribes well; Azure provides phoneme-level scoring
   - What's unclear: What level of detail is needed for Chinese pronunciation feedback?
   - Recommendation: Start with transcription comparison (simpler); add phoneme analysis in Phase 8 if needed

3. **Maximum Recording Duration**
   - What we know: Longer recordings = larger files = longer processing
   - What's unclear: What's the expected pronunciation exercise length?
   - Recommendation: Default 60 second limit; make configurable per interaction

4. **Audio Storage**
   - What we know: Coach review (Phase 7) may need stored audio
   - What's unclear: Store audio in database (blob) or external storage (S3)?
   - Recommendation: Defer storage decision to Phase 7; for now, audio is transient (graded and discarded)

## Sources

### Primary (HIGH confidence)
- [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) - API reference, browser support
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) - Permission handling, constraints
- [Can I Use MediaRecorder](https://caniuse.com/mediarecorder) - Browser compatibility matrix
- [WebKit MediaRecorder Blog](https://webkit.org/blog/11353/mediarecorder-api/) - Safari implementation details

### Secondary (MEDIUM confidence)
- [n8n Webhook Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) - Binary handling
- [n8n OpenAI Audio Operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/audio-operations/) - Transcription integration
- [OpenAI Audio API](https://platform.openai.com/docs/guides/speech-to-text) - gpt-4o-transcribe
- [Build with Matija - Safari MediaRecorder](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) - iOS Safari patterns

### Tertiary (LOW confidence)
- [Azure Pronunciation Assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) - Phoneme-level grading (not yet implemented)
- [SpeechSuper API](https://www.speechsuper.com/) - Alternative pronunciation API (not evaluated)
- Community discussions on RecordRTC vs native - General sentiment favors native API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native APIs are well-documented, no external dependencies
- Architecture: HIGH - Follows established patterns from TextInteraction
- Cross-browser: HIGH - Safari support confirmed since iOS 14.5 (2021)
- n8n integration: MEDIUM - Pattern is clear but specific workflow not yet built
- Pitfalls: MEDIUM - Based on documented browser quirks and community reports

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable browser APIs, may need update for n8n specifics)
