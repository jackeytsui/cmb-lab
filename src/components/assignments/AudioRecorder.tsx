"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, Square, Play, Pause, RotateCcw, Loader2, Upload } from "lucide-react";

interface AudioRecorderProps {
  onUpload: (blobUrl: string) => void;
  existingUrl?: string | null;
  maxSeconds?: number; // default 60
  /** Show an "upload a file instead" fallback next to the mic recorder. */
  allowFileUpload?: boolean;
}

type RecorderState = "idle" | "recording" | "recorded" | "uploading";

export function AudioRecorder({
  onUpload,
  existingUrl,
  maxSeconds = 60,
  allowFileUpload = false,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>(existingUrl ? "recorded" : "idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);
        setState("uploading");

        // Upload to Blob store
        const form = new FormData();
        form.append("file", blob, "recording.webm");
        form.append("prefix", "assignment-recordings/");
        try {
          const res = await fetch("/api/assignments/upload-audio", {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error("Upload failed");
          const { url } = await res.json();
          onUpload(url);
          setState("recorded");
        } catch {
          setError("Upload failed. Please try again.");
          setState("recorded");
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= maxSeconds) {
            stopRecording();
            return maxSeconds;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access denied. Please allow microphone use.");
    }
  }, [maxSeconds, stopTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setAudioUrl(null);
    setState("idle");
    setIsPlaying(false);
    setElapsed(0);
    setError(null);
  }, [stopTimer]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setError(null);
      if (file.size > 50_000_000) {
        setError("File exceeds 50 MB.");
        return;
      }
      const localUrl = URL.createObjectURL(file);
      setAudioUrl(localUrl);
      setState("uploading");
      const form = new FormData();
      form.append("file", file, file.name || "recording.m4a");
      form.append("prefix", "assignment-recordings/");
      try {
        const res = await fetch("/api/assignments/upload-audio", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || "Upload failed",
          );
        }
        const { url } = await res.json();
        onUpload(url);
        setState("recorded");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
        setAudioUrl(null);
        setState("idle");
      }
    },
    [onUpload],
  );

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [audioUrl, isPlaying]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {audioUrl && (
         
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      <div className="flex items-center gap-3">
        {state === "idle" && (
          <>
            <button
              type="button"
              onClick={startRecording}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              <Mic className="w-4 h-4" />
              Record
            </button>
            {allowFileUpload && (
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Upload className="w-4 h-4" />
                Upload a file
              </label>
            )}
          </>
        )}

        {state === "recording" && (
          <>
            <span className="flex items-center gap-2 text-sm text-red-400 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording {fmt(elapsed)} / {fmt(maxSeconds)}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          </>
        )}

        {state === "uploading" && (
          <span className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </span>
        )}

        {state === "recorded" && (
          <>
            <button
              type="button"
              onClick={togglePlay}
              className="flex items-center gap-2 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-600 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? "Pause" : "Play Back"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Re-record
            </button>
          </>
        )}
      </div>
    </div>
  );
}
