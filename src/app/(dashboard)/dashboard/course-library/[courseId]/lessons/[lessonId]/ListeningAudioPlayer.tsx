"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Listening Practice audio player.
//
// Custom controls (not native <audio controls>) so we can:
//   • offer fixed playback speeds 0.5 / 0.75 / 1 / 1.25 / 1.5
//   • let students drag the playhead to repeat any part
//   • keep the file non-downloadable (no download button, context menu blocked,
//     controlsList=nodownload)
//
// Audio source is either the sentence's uploaded override (streamed via the
// authenticated proxy) or, by default, TTS synthesised from the Chinese text
// and fetched lazily on first play (Redis-cached server-side, blob-cached here).
// ---------------------------------------------------------------------------

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ListeningAudioPlayer({
  lessonId,
  sentenceId,
  chinese,
  hasOverride,
  ttsLanguage = "zh-CN",
}: {
  lessonId: string;
  sentenceId: string;
  chinese: string;
  hasOverride: boolean;
  /** TTS voice language for generated audio (zh-HK for Cantonese lessons). */
  ttsLanguage?: "zh-CN" | "zh-HK";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [srcReady, setSrcReady] = useState(hasOverride);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  const overrideSrc = `/api/course-library/listening-audio/${lessonId}?sentence=${encodeURIComponent(
    sentenceId,
  )}`;

  // Cleanup any TTS blob URL on unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Ensure the <audio> has a src. Overrides use the proxy URL directly; TTS is
  // fetched once and turned into a blob URL.
  const ensureSource = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    if (audio.src) return true;

    if (hasOverride) {
      audio.src = overrideSrc;
      return true;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chinese, language: ttsLanguage, rate: "medium" }),
      });
      if (!res.ok) throw new Error(`TTS failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      audio.src = url;
      setSrcReady(true);
      return true;
    } catch {
      setError("Audio unavailable. Try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [chinese, hasOverride, overrideSrc, ttsLanguage]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    const ok = await ensureSource();
    if (!ok) return;
    audio.playbackRate = speed;
    try {
      await audio.play();
    } catch {
      setError("Tap again to play.");
    }
  }, [ensureSource, playing, speed]);

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrent(0);
  }, []);

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  const changeSpeed = (value: number) => {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      {/* Native element kept headless; custom controls below. */}
      <audio
        ref={audioRef}
        preload="none"
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          e.currentTarget.playbackRate = speed;
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          aria-label={playing ? "Pause" : "Play"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" />
          )}
        </button>

        <button
          type="button"
          onClick={restart}
          className="shrink-0 text-muted-foreground/70 hover:text-foreground"
          aria-label="Restart"
          title="Restart"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <div className="flex flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(current, duration || 0)}
            onChange={(e) => onSeek(Number(e.target.value))}
            disabled={!srcReady || duration === 0}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
            aria-label="Seek"
          />
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <span className="mr-1 text-[11px] text-muted-foreground">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeSpeed(s)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
              speed === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {s}×
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
