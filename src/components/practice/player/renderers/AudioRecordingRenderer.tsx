"use client";

import { Mic, Square, RotateCcw } from "lucide-react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import type { AudioRecordingDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface AudioRecordingRendererProps {
  definition: AudioRecordingDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { audioBlob: Blob }) => void;
  disabled?: boolean;
}

// ============================================================
// Helpers
// ============================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================
// AudioRecordingRenderer
// ============================================================

export function AudioRecordingRenderer({
  definition,
  language,
  onSubmit,
  disabled = false,
}: AudioRecordingRendererProps) {
  const {
    status,
    audioBlob,
    audioUrl,
    recordingTime,
    startRecording,
    stopRecording,
    reset,
    error,
  } = useAudioRecorder();

  const forceLanguage =
    language === "cantonese"
      ? ("cantonese" as const)
      : language === "mandarin"
        ? ("mandarin" as const)
        : undefined;

  function handleSubmit() {
    if (!audioBlob || disabled) return;
    onSubmit({ audioBlob });
  }

  return (
    <div className="space-y-6">
      {/* Target phrase */}
      <div className="text-center">
        <p className="text-lg font-medium text-zinc-100">
          <PhoneticText forceLanguage={forceLanguage}>
            {definition.targetPhrase}
          </PhoneticText>
        </p>
        {definition.referenceText && (
          <p className="mt-2 text-sm text-zinc-400">
            {definition.referenceText}
          </p>
        )}
      </div>

      {/* Recording controls - state machine */}
      <div className="flex flex-col items-center gap-4">
        {/* Idle state: show Record button */}
        {status === "idle" && (
          <button
            type="button"
            disabled={disabled}
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-white font-medium transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-5 w-5" />
            Record
          </button>
        )}

        {/* Recording state: show Stop button with pulsing indicator + timer */}
        {status === "recording" && (
          <>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-700 px-6 py-3 text-white font-medium transition hover:bg-zinc-600"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop
            </button>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-sm text-zinc-400">
                {formatTime(recordingTime)}
              </span>
            </div>
          </>
        )}

        {/* Stopped state: playback + re-record + submit */}
        {status === "stopped" && audioUrl && (
          <>
            { }
            <audio
              src={audioUrl}
              controls
              className="w-full max-w-xs rounded-lg"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Re-record
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleSubmit}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit Recording
              </button>
            </div>
          </>
        )}

        {/* Error state: show error + retry */}
        {status === "error" && (
          <>
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-white font-medium transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
