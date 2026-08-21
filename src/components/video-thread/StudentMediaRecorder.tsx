"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Mic, Video, StopCircle, RotateCcw, Upload, Loader2, AlertCircle } from "lucide-react";

interface StudentMediaRecorderProps {
  mode: "audio" | "video";
  threadId: string;
  courseLessonId?: string;
  onUploadComplete: (result: { muxPlaybackId: string; uploadId: string }) => void;
  onCancel: () => void;
  disabled?: boolean;
}

type RecorderState = "idle" | "recording" | "recorded" | "uploading" | "error";
const MAX_RECORDING_SECONDS = 5 * 60;
const MAX_RECORDING_BYTES = 250 * 1024 * 1024;

function selectRecorderMimeType(mode: "audio" | "video"): string | undefined {
  const candidates =
    mode === "video"
      ? ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionForMimeType(type: string): string {
  return type.includes("mp4") ? "mp4" : "webm";
}

export function StudentMediaRecorder({
  mode,
  threadId,
  courseLessonId,
  onUploadComplete,
  onCancel,
  disabled = false,
}: StudentMediaRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const playbackAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState("");

  // ─── Media Stream ────────────────────────────────────────────────────────

  const startStream = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints =
        mode === "video"
          ? { audio: true, video: true }
          : { audio: true, video: false };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (mode === "video" && videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setRecorderState("idle");
      setErrorMessage(null);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setErrorMessage(
        mode === "video"
          ? "Unable to access camera and microphone. Please check permissions."
          : "Unable to access microphone. Please check permissions."
      );
      setRecorderState("error");
    }
  }, [mode]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startStream();
    return () => {
      stopStream();
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, [startStream, stopStream]);

  // ─── Recording ───────────────────────────────────────────────────────────

  const startRecording = () => {
    if (!streamRef.current) return;

    const selectedMimeType = selectRecorderMimeType(mode);
    const recorder = new MediaRecorder(
      streamRef.current,
      selectedMimeType ? { mimeType: selectedMimeType } : undefined,
    );
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || selectedMimeType || undefined,
      });
      const url = URL.createObjectURL(blob);
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = url;
      setRecordedBlob(blob);
      setRecordedUrl(url);
      setRecorderState("recorded");
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecorderState("recording");
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          mediaRecorderRef.current?.stop();
          stopStream();
        }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recorderState === "recording") {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Stop live preview stream
      stopStream();
    }
  };

  // ─── Retake ──────────────────────────────────────────────────────────────

  const handleRetake = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrlRef.current = null;
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsed(0);
    setErrorMessage(null);
    startStream();
  };

  // ─── Upload ──────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!recordedBlob) return;
    if (recordedBlob.size > MAX_RECORDING_BYTES) {
      setErrorMessage("Recording is too large. Keep it under 250 MB and try again.");
      setRecorderState("error");
      return;
    }

    setRecorderState("uploading");
    setUploadProgress("Getting upload URL...");
    setErrorMessage(null);

    try {
      // Step 1: Get Mux direct upload URL
      const contentType =
        recordedBlob.type || (mode === "video" ? "video/webm" : "audio/webm");
      const ext = extensionForMimeType(contentType);
      const urlRes = await fetch(
        `/api/video-threads/${threadId}/upload-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get-upload-url",
            filename: `response-${Date.now()}.${ext}`,
            courseLessonId,
          }),
        }
      );

      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to get upload URL");
      }

      const { uploadUrl, uploadId } = await urlRes.json();

      // Step 2: PUT blob to Mux
      setUploadProgress("Uploading...");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": contentType },
      });

      if (!putRes.ok) {
        throw new Error("Failed to upload media to Mux");
      }

      // Step 3: Poll for status
      setUploadProgress("Processing...");
      const MAX_POLLS = 20;
      const POLL_INTERVAL = 3000;

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        const statusRes = await fetch(
          `/api/video-threads/${threadId}/upload-response`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check-status", uploadId, courseLessonId }),
          }
        );

        if (!statusRes.ok) continue; // Retry on network errors

        const statusData = await statusRes.json();

        if (statusData.status === "ready") {
          onUploadComplete({
            muxPlaybackId: statusData.muxPlaybackId,
            uploadId,
          });
          return;
        }

        if (statusData.status === "errored") {
          throw new Error(statusData.errorMessage || "Processing failed");
        }

        setUploadProgress(
          `Processing... (${Math.round(((attempt + 1) / MAX_POLLS) * 100)}%)`
        );
      }

      // Timeout
      throw new Error("Processing timed out. Please try again.");
    } catch (error) {
      console.error("Upload error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed. Please try again."
      );
      setRecorderState("error");
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    if (recordedBlob) {
      setRecorderState("recorded");
    } else {
      handleRetake();
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  // Error state
  if (recorderState === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl bg-black/60 backdrop-blur-sm">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-white text-sm text-center max-w-[240px]">
          {errorMessage}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            Retry
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Uploading state
  if (recorderState === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl bg-black/60 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-white text-sm font-medium">{uploadProgress}</p>
        <p className="text-white/50 text-xs">This may take up to 60 seconds</p>
      </div>
    );
  }

  // Recorded state -- playback preview with retake/upload buttons
  if (recorderState === "recorded" && recordedUrl) {
    return (
      <div className="flex flex-col items-center gap-3 p-3 rounded-xl bg-black/60 backdrop-blur-sm">
        {mode === "video" ? (
          <video
            ref={playbackVideoRef}
            src={recordedUrl}
            controls
            className="w-full max-w-[280px] rounded-lg aspect-video object-cover"
          />
        ) : (
          <audio
            ref={playbackAudioRef}
            src={recordedUrl}
            controls
            className="w-full max-w-[240px]"
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={handleRetake}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake
          </button>
          <button
            onClick={handleUpload}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>
      </div>
    );
  }

  // Idle / Recording state
  return (
    <div className="flex flex-col items-center gap-3 p-3 rounded-xl bg-black/60 backdrop-blur-sm">
      {/* Live preview area */}
      {mode === "video" ? (
        <div className="relative w-full max-w-[280px] aspect-video rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
          {recorderState === "recording" && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 bg-red-500/80 rounded-full">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              <span className="text-white text-[10px] font-medium">
                {formatTime(elapsed)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-3">
          {recorderState === "recording" ? (
            <>
              {/* Animated pulsing circle for audio recording indicator */}
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 animate-ping absolute" />
                <div className="w-12 h-12 rounded-full bg-red-500/30 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-red-400" />
                </div>
              </div>
              <span className="text-white text-sm font-medium tabular-nums">
                {formatTime(elapsed)}
              </span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Mic className="w-5 h-5 text-white/70" />
              </div>
              <span className="text-white/50 text-xs">Ready to record</span>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {recorderState === "recording" ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors animate-pulse"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Stop
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={disabled || !streamRef.current}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            {mode === "video" ? (
              <Video className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            Record
          </button>
        )}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
