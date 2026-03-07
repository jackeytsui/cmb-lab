"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getSupportedMimeType } from "@/lib/audio-utils";

/**
 * Recording state machine states.
 */
export type RecordingStatus = "idle" | "recording" | "stopped" | "error";

/**
 * Return type for useAudioRecorder hook.
 */
export interface UseAudioRecorderReturn {
  /** Current recording status */
  status: RecordingStatus;
  /** Recorded audio blob (available after stopping) */
  audioBlob: Blob | null;
  /** Object URL for audio playback (available after stopping) */
  audioUrl: string | null;
  /** Detected MIME type of the recording */
  mimeType: string | null;
  /** Error message if status is 'error' */
  error: string | null;
  /** Recording duration in seconds */
  recordingTime: number;
  /** Start recording (requests microphone permission) */
  startRecording: () => Promise<void>;
  /** Stop the current recording */
  stopRecording: () => void;
  /** Reset to initial state (clears recording) */
  reset: () => void;
}

/**
 * Maximum recording duration in seconds.
 */
const MAX_RECORDING_DURATION = 60;

/**
 * Hook for managing audio recording with MediaRecorder API.
 * Provides cross-browser support with automatic MIME type detection.
 *
 * @example
 * ```tsx
 * const { status, audioBlob, audioUrl, startRecording, stopRecording, reset } = useAudioRecorder();
 *
 * if (status === 'idle') return <button onClick={startRecording}>Record</button>;
 * if (status === 'recording') return <button onClick={stopRecording}>Stop</button>;
 * if (status === 'stopped') return <audio src={audioUrl} controls />;
 * ```
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Clean up resources (stream tracks, timer, URL).
   */
  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop all stream tracks (release microphone)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clear media recorder reference
    mediaRecorderRef.current = null;
  }, []);

  /**
   * Start recording audio from the microphone.
   */
  const startRecording = useCallback(async () => {
    // Clear any previous error
    setError(null);

    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Detect supported MIME type
      const detectedMimeType = getSupportedMimeType();
      setMimeType(detectedMimeType);

      // 3. Create MediaRecorder with detected MIME type
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: detectedMimeType,
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // 4. Set up data handler
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 5. Set up stop handler
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: detectedMimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus("stopped");
      };

      // 6. Set up error handler
      mediaRecorder.onerror = () => {
        setError("Recording error occurred. Please try again.");
        setStatus("error");
        cleanup();
      };

      // 7. Start recording
      mediaRecorder.start();
      setStatus("recording");
      setRecordingTime(0);

      // 8. Start timer (updates every second)
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          // Auto-stop at max duration
          if (newTime >= MAX_RECORDING_DURATION) {
            mediaRecorderRef.current?.stop();
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            // Stop stream tracks
            streamRef.current?.getTracks().forEach((track) => track.stop());
          }
          return newTime;
        });
      }, 1000);
    } catch (err) {
      // Handle specific error types with user-friendly messages
      if (err instanceof DOMException) {
        switch (err.name) {
          case "NotAllowedError":
            setError(
              "Microphone access denied. Please allow microphone access in your browser settings."
            );
            break;
          case "NotFoundError":
            setError(
              "No microphone found. Please connect a microphone and try again."
            );
            break;
          case "NotSupportedError":
            setError("Audio recording is not supported in this browser.");
            break;
          default:
            setError("Failed to start recording. Please try again.");
        }
      } else {
        setError("Failed to start recording. Please try again.");
      }
      setStatus("error");
      cleanup();
    }
  }, [cleanup]);

  /**
   * Stop the current recording.
   */
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop stream tracks (release microphone)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  }, []);

  /**
   * Reset to initial state.
   */
  const reset = useCallback(() => {
    // Revoke previous URL to prevent memory leak
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    // Clean up resources
    cleanup();

    // Reset state
    setStatus("idle");
    setAudioBlob(null);
    setAudioUrl(null);
    setMimeType(null);
    setError(null);
    setRecordingTime(0);
    chunksRef.current = [];
  }, [audioUrl, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    audioBlob,
    audioUrl,
    mimeType,
    error,
    recordingTime,
    startRecording,
    stopRecording,
    reset,
  };
}
