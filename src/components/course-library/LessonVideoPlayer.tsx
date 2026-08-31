"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface LessonVideoPlayerProps {
  /** Authenticated stream endpoint for this lesson's video. */
  src: string;
  lessonId: string;
  nextHref: string | null;
}

/** Bound the silent-loading states so students always get a recovery path. */
export const SLOW_LOAD_MS = 8000;
export const MANUAL_RETRY_MS = 20000;
export const HARD_FAILURE_MS = 30000;
export const STALL_RECOVERY_MS = 8000;
const AUTO_RETRY_DELAYS_MS = [3000, 8000] as const;

/**
 * Native <video> player for Course Library lessons.
 *
 * Playback is always user-initiated. This prevents a lesson from unexpectedly
 * starting audio (or completing itself) just because a student opened it.
 *
 * While the video buffers for the first time (it streams through an
 * authenticated proxy) we show a short overlay so students know to wait.
 * Transient media failures are retried quietly. We only surface a manual
 * recovery action after a patient loading window, so a brief Blob/CDN or
 * network interruption never flashes an alarming error at the student.
 */
const MEDIA_ERR_LABELS: Record<number, string> = {
  1: "ABORTED",
  2: "NETWORK",
  3: "DECODE",
  4: "SRC_NOT_SUPPORTED",
};

export function LessonVideoPlayer({
  src,
  lessonId,
  nextHref,
}: LessonVideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadStartedAtRef = useRef(0);
  const autoRetryCountRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantsPlaybackRef = useRef(false);
  const lastPositionRef = useRef(0);
  const resumePositionRef = useRef<number | null>(null);
  const ignoreLoadPauseRef = useRef(false);
  const bufferingRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [slow, setSlow] = useState(false);
  const [showManualRetry, setShowManualRetry] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);

  // On error, capture the MediaError and probe the stream endpoint so the
  // on-screen message (and any screenshot of it) pinpoints the real cause:
  // e.g. "Error DECODE — HTTP 206, video/mp4" = codec problem, while
  // "HTTP 502 (upstream 403)" = storage token problem.
  const diagnose = useCallback(async () => {
    const video = videoRef.current;
    const err = video?.error;
    const errPart = err
      ? `Error ${err.code} (${MEDIA_ERR_LABELS[err.code] ?? "UNKNOWN"})${err.message ? `: ${err.message}` : ""}`
      : `Media stalled (readyState ${video?.readyState ?? "?"}, networkState ${video?.networkState ?? "?"})`;
    let httpPart = "";
    try {
      const res = await fetch(src.split("#")[0], {
        headers: { Range: "bytes=0-1" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const type = res.headers.get("content-type") ?? "?";
      let upstream = "";
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.upstreamStatus) upstream = `, upstream ${body.upstreamStatus}`;
      }
      httpPart = ` — HTTP ${res.status}${upstream}, ${type}`;
      if (res.ok) await res.body?.cancel();
    } catch {
      httpPart = " — network request failed";
    }
    setDiagnosis(`${errPart}${httpPart}`);
  }, [src]);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  // Course MP4s can store their metadata index at the end of the file. Keep a
  // short patient window for that tail probe, then guarantee that a silent
  // readyState=0 stall becomes actionable instead of spinning indefinitely.
  useEffect(() => {
    if (status !== "loading") return;
    const elapsed = loadStartedAtRef.current
      ? Date.now() - loadStartedAtRef.current
      : 0;
    const slowTimer = setTimeout(
      () => setSlow(true),
      Math.max(0, SLOW_LOAD_MS - elapsed),
    );
    const retryTimer = setTimeout(
      () => setShowManualRetry(true),
      Math.max(0, MANUAL_RETRY_MS - elapsed),
    );
    const failureTimer = setTimeout(() => {
      const video = videoRef.current;
      if (video && !wantsPlaybackRef.current &&
          video.readyState >= HTMLMediaElement.HAVE_METADATA && !video.error) {
        setStatus("ready");
        return;
      }
      setShowManualRetry(true);
      setStatus("error");
      void diagnose();
    }, Math.max(0, HARD_FAILURE_MS - elapsed));
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(retryTimer);
      clearTimeout(failureTimer);
    };
  }, [diagnose, status, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    loadStartedAtRef.current = Date.now();
    autoRetryCountRef.current = 0;
    wantsPlaybackRef.current = false;
    lastPositionRef.current = 0;
    resumePositionRef.current = null;
    ignoreLoadPauseRef.current = false;
    bufferingRef.current = false;
    clearRecoveryTimer();
    // If it's already buffered (e.g. cached, or canplay fired before
    // hydration attached our listeners), skip the overlay. Checked in a
    // frame callback so the effect body stays free of synchronous setState.
    const raf = requestAnimationFrame(() => {
      setSlow(false);
      setShowManualRetry(false);
      setDiagnosis(null);
      setStatus(
        video.readyState >= HTMLMediaElement.HAVE_METADATA
          ? "ready"
          : "loading",
      );
    });
    return () => {
      cancelAnimationFrame(raf);
      clearRecoveryTimer();
    };
  }, [clearRecoveryTimer, src]);

  const markReady = useCallback(() => {
    clearRecoveryTimer();
    bufferingRef.current = false;
    setStatus("ready");
  }, [clearRecoveryTimer]);

  const beginBuffering = useCallback(() => {
    if (!bufferingRef.current) {
      loadStartedAtRef.current = Date.now();
      bufferingRef.current = true;
      setSlow(false);
      setShowManualRetry(false);
      setDiagnosis(null);
    }
    setStatus("loading");
  }, []);

  const restorePosition = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const position = resumePositionRef.current;
    if (position !== null) {
      // Avoid seeking to the exact end: a recovery must never complete a
      // lesson just because duration rounding puts the cursor at EOF.
      video.currentTime = Number.isFinite(video.duration)
        ? Math.min(position, Math.max(0, video.duration - 0.1))
        : position;
      lastPositionRef.current = video.currentTime;
      resumePositionRef.current = null;
    }
    ignoreLoadPauseRef.current = false;
    // Metadata alone is enough to expose native controls before first play,
    // but does not prove an interrupted video is ready to resume.
    if (!wantsPlaybackRef.current) markReady();
  }, [markReady]);

  const reloadMedia = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    resumePositionRef.current ??= video.currentTime || lastPositionRef.current;
    ignoreLoadPauseRef.current = !video.paused;
    video.defaultPlaybackRate = video.playbackRate;
    // load() refreshes the protected playback URL. Restore the cursor when
    // metadata arrives and preserve volume/mute/rate and the user's pause.
    video.load();
    if (wantsPlaybackRef.current) {
      // Set the default playback start now as well, before play() can begin.
      video.currentTime = resumePositionRef.current;
      void video.play()?.catch((error: unknown) => {
        // A network/decode rejection also emits `error`; do not cancel its
        // recovery timer. Only autoplay denial should hand back native Play.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          wantsPlaybackRef.current = false;
          markReady();
        }
      });
    }
  }, [markReady]);

  const retry = useCallback(() => {
    clearRecoveryTimer();
    autoRetryCountRef.current = 0;
    bufferingRef.current = false;
    // Clicking Retry is an explicit request to resume playback.
    wantsPlaybackRef.current = true;
    beginBuffering();
    reloadMedia();
  }, [beginBuffering, clearRecoveryTimer, reloadMedia]);

  const recoverFromMediaError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    clearRecoveryTimer();
    beginBuffering();

    const retryIndex = autoRetryCountRef.current;
    if (retryIndex < AUTO_RETRY_DELAYS_MS.length) {
      autoRetryCountRef.current += 1;
      recoveryTimerRef.current = setTimeout(() => {
        recoveryTimerRef.current = null;
        reloadMedia();
      }, AUTO_RETRY_DELAYS_MS[retryIndex]);
      return;
    }

    const remaining = Math.max(
      0,
      MANUAL_RETRY_MS - (Date.now() - loadStartedAtRef.current),
    );
    recoveryTimerRef.current = setTimeout(() => {
      setShowManualRetry(true);
      setStatus("error");
      void diagnose();
    }, remaining);
  }, [beginBuffering, clearRecoveryTimer, diagnose, reloadMedia]);

  const recoverFromStall = useCallback(() => {
    const video = videoRef.current;
    // `stalled` can fire during a healthy paused preload. Only recover if
    // playback actually ran out of data, not while the user is paused.
    if (!video || video.paused || video.ended || video.readyState >= 3) return;
    beginBuffering();
    if (recoveryTimerRef.current ||
        autoRetryCountRef.current >= AUTO_RETRY_DELAYS_MS.length) return;
    const position = video.currentTime;
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      if (video.paused || !wantsPlaybackRef.current) return;
      if (video.currentTime > position + 0.25 || video.readyState >= 3) {
        markReady();
        return;
      }
      autoRetryCountRef.current += 1;
      reloadMedia();
    }, STALL_RECOVERY_MS);
  }, [beginBuffering, markReady, reloadMedia]);

  const handlePause = useCallback(() => {
    if (ignoreLoadPauseRef.current) {
      ignoreLoadPauseRef.current = false;
      return;
    }
    if (videoRef.current?.error) return;
    wantsPlaybackRef.current = false;
    markReady();
  }, [markReady]);

  const completeAndAdvance = useCallback(async () => {
    const response = await fetch(
      `/api/course-library/lessons/${lessonId}/progress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      },
    );

    if (response.ok && nextHref) {
      router.push(nextHref);
    }
  }, [lessonId, nextHref, router]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        aria-label="Lesson video"
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className="h-full w-full"
        onLoadedMetadata={restorePosition}
        onCanPlay={markReady}
        onPlaying={markReady}
        onPlay={() => { wantsPlaybackRef.current = true; }}
        onPause={handlePause}
        onWaiting={recoverFromStall}
        onStalled={recoverFromStall}
        onTimeUpdate={(event) => {
          if (resumePositionRef.current === null) {
            lastPositionRef.current = event.currentTarget.currentTime;
          }
        }}
        onSeeking={(event) => {
          if (resumePositionRef.current === null) {
            lastPositionRef.current = event.currentTarget.currentTime;
          }
        }}
        onEnded={() => void completeAndAdvance()}
        onError={recoverFromMediaError}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm font-medium text-white">Loading your video…</p>
          {slow ? (
            <>
              <p className="max-w-xs text-xs text-white/70">
                This is taking a little longer than usual. Please don&apos;t
                refresh or leave this page — we&apos;re still loading your video.
              </p>
              {showManualRetry && (
                <button
                  type="button"
                  onClick={retry}
                  className="pointer-events-auto rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Reload video
                </button>
              )}
            </>
          ) : (
            <p className="max-w-xs text-xs text-white/70">
              Please don&apos;t refresh or leave this page. It&apos;ll be ready
              to play in a moment.
            </p>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="text-sm font-medium text-white">
            The video couldn&apos;t be loaded.
          </p>
          <p className="max-w-xs text-xs text-white/70">
            This is usually a temporary connection issue. Try again — if it
            keeps happening, refresh the page or let the team know.
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90"
          >
            Try again
          </button>
          {diagnosis && (
            <p className="max-w-md font-mono text-[10px] text-white/50">
              {diagnosis}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
