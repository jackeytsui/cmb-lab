"use client";

import { useEffect } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { validateAudioBlob } from "@/lib/audio-utils";

interface AudioRecorderProps {
  /**
   * Callback when recording is complete and valid.
   * Receives the audio blob and its MIME type.
   */
  onRecordingComplete: (blob: Blob, mimeType: string) => void;
  /**
   * Callback when user clicks re-record.
   */
  onReset?: () => void;
  /**
   * Whether the recorder is disabled.
   */
  disabled?: boolean;
  /**
   * Maximum recording duration in seconds.
   * @default 60
   */
  maxDuration?: number;
}

/**
 * Format seconds as MM:SS.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Audio recording UI component with start/stop controls and playback.
 *
 * Uses the useAudioRecorder hook for MediaRecorder management.
 * Displays different UI based on recording status:
 * - idle: Start Recording button
 * - recording: Stop button with timer
 * - stopped: Audio playback with re-record option
 * - error: Error message with Try Again button
 */
export function AudioRecorder({
  onRecordingComplete,
  onReset,
  disabled = false,
}: AudioRecorderProps) {
  const {
    status,
    audioBlob,
    audioUrl,
    mimeType,
    error,
    recordingTime,
    startRecording,
    stopRecording,
    reset,
  } = useAudioRecorder();

  // Call onRecordingComplete when recording stops and blob is valid
  useEffect(() => {
    if (status === "stopped" && audioBlob && mimeType) {
      if (validateAudioBlob(audioBlob)) {
        onRecordingComplete(audioBlob, mimeType);
      }
    }
  }, [status, audioBlob, mimeType, onRecordingComplete]);

  // Handle re-record
  function handleReRecord() {
    reset();
    onReset?.();
  }

  // Handle try again after error
  function handleTryAgain() {
    reset();
  }

  // Idle state - show Start Recording button
  if (status === "idle") {
    return (
      <div className="flex flex-col items-center gap-4">
        <Button
          onClick={startRecording}
          size="lg"
          className="gap-2"
          disabled={disabled}
        >
          <Mic className="h-5 w-5" />
          Start Recording
        </Button>
        <p className="text-sm text-zinc-400">Click to begin recording</p>
      </div>
    );
  }

  // Recording state - show Stop button with timer
  if (status === "recording") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white font-mono text-lg">
            {formatTime(recordingTime)}
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
        <p className="text-sm text-zinc-400">Recording in progress...</p>
      </div>
    );
  }

  // Error state - show error message with Try Again button
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-center max-w-md">
          {error || "An error occurred. Please try again."}
        </div>
        <Button onClick={handleTryAgain} variant="outline" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Stopped state - show playback and re-record option
  if (status === "stopped" && audioUrl) {
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-md">
        {/* Native audio element for playback */}
        <audio src={audioUrl} controls className="w-full rounded-lg" />

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            Duration: {formatTime(recordingTime)}
          </span>
          <Button
            onClick={handleReRecord}
            variant="ghost"
            size="sm"
            className="gap-2 text-zinc-400 hover:text-white"
            disabled={disabled}
          >
            <RotateCcw className="h-4 w-4" />
            Re-record
          </Button>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
