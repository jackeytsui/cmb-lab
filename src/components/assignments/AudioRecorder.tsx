"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  AudioLines,
  Square,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Upload,
  Video,
} from "lucide-react";
import { upload } from "@vercel/blob/client";

// Upload a recording straight to Vercel Blob (private). Direct-to-blob avoids
// the ~4.5MB serverless request-body cap, so long recordings (e.g. a 5-minute
// diary read) and large uploaded files don't 413.
async function uploadRecording(blob: Blob, filename: string): Promise<string> {
  // MediaRecorder blobs are typed "audio/webm;codecs=opus"; the upload
  // allow-list matches base MIME types, so strip the codecs parameter or the
  // content type is rejected ("Upload failed").
  const contentType = (blob.type || "audio/webm").split(";")[0].trim();
  const result = await upload(`assignment-recordings/${filename}`, blob, {
    access: "private",
    contentType,
    handleUploadUrl: "/api/assignments/recording-upload-token",
    multipart: true,
  });
  return result.url;
}

export type RecordingMediaType = "audio" | "video";

interface AudioRecorderProps {
  onUpload: (blobUrl: string, mediaType: RecordingMediaType) => void;
  /** Clear the saved response before a student chooses another format. */
  onRemove?: () => void;
  existingUrl?: string | null;
  existingMediaType?: RecordingMediaType;
  maxSeconds?: number; // default 60
  /** Show an "upload a file instead" fallback next to the mic recorder. */
  allowFileUpload?: boolean;
  /** Native Vocal Hacks preserve VideoAsk's enabled audio/video response modes. */
  allowedMediaTypes?: RecordingMediaType[];
}

type RecorderState = "idle" | "recording" | "recorded" | "uploading";

export function AudioRecorder({
  onUpload,
  onRemove,
  existingUrl,
  existingMediaType = "audio",
  maxSeconds = 60,
  allowFileUpload = false,
  allowedMediaTypes = ["audio"],
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>(
    existingUrl ? "recorded" : "idle",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [mediaType, setMediaType] =
    useState<RecordingMediaType>(existingMediaType);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [stopTimer]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video || !liveStream) return;
    video.srcObject = liveStream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [liveStream, state]);

  const startRecording = useCallback(
    async (kind: RecordingMediaType) => {
      setError(null);
      try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "video"
          ? { audio: true, video: { facingMode: "user" } }
          : { audio: true },
      );
      const mimeCandidates =
        kind === "video"
          ? [
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
            ]
          : ["audio/webm;codecs=opus", "audio/webm"];
      const mimeType = mimeCandidates.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      );
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setLiveStream(null);
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || `${kind}/webm`,
        });
        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);
        setMediaType(kind);
        setState("uploading");

        // Upload straight to Blob (direct-to-blob; no 4.5MB serverless cap).
        try {
          const url = await uploadRecording(
            blob,
            kind === "video"
              ? "video-response.webm"
              : "audio-response.webm",
          );
          onUpload(url, kind);
          setState("recorded");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Upload failed. Please try again.",
          );
          setState("recorded");
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setLiveStream(stream);
      setMediaType(kind);
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= maxSeconds) {
            stopTimer();
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            return maxSeconds;
          }
          return s + 1;
        });
      }, 1000);
      } catch {
        setError(
          kind === "video"
            ? "Camera or microphone access was denied. Please allow both and try again."
            : "Microphone access was denied. Please allow it and try again.",
        );
      }
    },
    [maxSeconds, onUpload, stopTimer],
  );

  const reset = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setAudioUrl(null);
    setState("idle");
    setIsPlaying(false);
    setElapsed(0);
    setError(null);
    setMediaType(allowedMediaTypes[0] ?? "audio");
    setLiveStream(null);
    onRemove?.();
  }, [allowedMediaTypes, onRemove, stopTimer]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setError(null);
      if (file.size > 200 * 1024 * 1024) {
        setError("File exceeds 200 MB.");
        return;
      }
      const selectedType: RecordingMediaType = file.type.startsWith("video/")
        ? "video"
        : "audio";
      if (!allowedMediaTypes.includes(selectedType)) {
        setError(
          `${selectedType === "video" ? "Video" : "Audio"} responses are not enabled for this step.`,
        );
        return;
      }
      const localUrl = URL.createObjectURL(file);
      setAudioUrl(localUrl);
      setMediaType(selectedType);
      setState("uploading");
      try {
        const url = await uploadRecording(file, file.name || "recording.m4a");
        onUpload(url, selectedType);
        setState("recorded");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Upload failed. Please try again.",
        );
        setAudioUrl(null);
        setState("idle");
      }
    },
    [allowedMediaTypes, onUpload],
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
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {audioUrl && mediaType === "audio" && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {audioUrl && mediaType === "video" && (
        <video
          ref={videoRef}
          aria-label="Your recorded video"
          src={audioUrl}
          controls
          playsInline
          preload="metadata"
          className="max-h-64 w-full rounded-md bg-black"
        />
      )}

      {state === "recording" && mediaType === "video" && (
        <video
          ref={liveVideoRef}
          muted
          autoPlay
          playsInline
          className="max-h-64 w-full rounded-md bg-black object-contain"
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {state === "idle" && (
          <>
            {allowedMediaTypes.includes("audio") && (
              <button
                type="button"
                onClick={() => startRecording("audio")}
                className="inline-flex items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <AudioLines className="w-4 h-4" aria-hidden="true" />
                {allowedMediaTypes.length > 1 ? "Record audio" : "Record"}
              </button>
            )}
            {allowedMediaTypes.includes("video") && (
              <button
                type="button"
                onClick={() => startRecording("video")}
                className="inline-flex items-center gap-2 rounded-md border border-[#f2b705]/55 bg-[#f2b705]/15 px-4 py-2 text-sm font-semibold text-[#765900] transition-colors hover:bg-[#f2b705]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2b705]/50 dark:text-[#f7cf4a]"
              >
                <Video className="w-4 h-4" aria-hidden="true" />
                Record video
              </button>
            )}
            {allowFileUpload && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring/60">
                <input
                  aria-label="Upload a recording file"
                  type="file"
                  accept={allowedMediaTypes
                    .map((type) => `${type}/*`)
                    .join(",")}
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
            <span className="flex items-center gap-2 text-sm font-medium text-destructive">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
              Recording {fmt(elapsed)} / {fmt(maxSeconds)}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          </>
        )}

        {state === "uploading" && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </span>
        )}

        {state === "recorded" && (
          <>
            {mediaType === "audio" && (
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isPlaying ? "Pause" : "Play Back"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              <RotateCcw className="w-4 h-4" />
              Remove response
            </button>
          </>
        )}
      </div>
    </div>
  );
}
