"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface LessonVideoPlayerProps {
  /** Authenticated stream endpoint for this lesson's video. */
  src: string;
  lessonId: string;
  nextHref: string | null;
}

/** Loading stays patient before we expose a manual recovery action. */
const SLOW_LOAD_MS = 20000;
const MANUAL_RETRY_MS = 45000;
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
      : "Unknown media error";
    let httpPart = "";
    try {
      const res = await fetch(src.split("#")[0], {
        headers: { Range: "bytes=0-1" },
        cache: "no-store",
      });
      const type = res.headers.get("content-type") ?? "?";
      let upstream = "";
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.upstreamStatus) upstream = `, upstream ${body.upstreamStatus}`;
      }
      httpPart = ` — HTTP ${res.status}${upstream}, ${type}`;
    } catch {
      httpPart = " — network request failed";
    }
    setDiagnosis(`${errPart}${httpPart}`);
  }, [src]);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  // The message changes after 20 seconds, but a reload action is deliberately
  // withheld until 45 seconds. Slow connections get time to recover normally.
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
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(retryTimer);
    };
  }, [status, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    loadStartedAtRef.current = Date.now();
    autoRetryCountRef.current = 0;
    clearRecoveryTimer();
    // If it's already buffered (e.g. cached, or canplay fired before
    // hydration attached our listeners), skip the overlay. Checked in a
    // frame callback so the effect body stays free of synchronous setState.
    const raf = requestAnimationFrame(() => {
      setSlow(false);
      setShowManualRetry(false);
      setDiagnosis(null);
      setStatus(video.readyState >= 3 ? "ready" : "loading");
    });
    return () => {
      cancelAnimationFrame(raf);
      clearRecoveryTimer();
    };
  }, [clearRecoveryTimer, src]);

  const markReady = useCallback(() => {
    clearRecoveryTimer();
    autoRetryCountRef.current = 0;
    setStatus("ready");
  }, [clearRecoveryTimer]);

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setSlow(false);
    setShowManualRetry(false);
    setDiagnosis(null);
    setStatus("loading");
    loadStartedAtRef.current = Date.now();
    autoRetryCountRef.current = 0;
    clearRecoveryTimer();
    // load() re-issues the request from scratch (fresh auth cookies included),
    // which recovers from transient network/session hiccups. Retry is a user
    // gesture, so unmuted playback is permitted by browser autoplay policy.
    video.load();
    video.muted = false;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {});
    }
  }, [clearRecoveryTimer]);

  const recoverFromMediaError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    clearRecoveryTimer();
    setStatus("loading");
    setSlow(Date.now() - loadStartedAtRef.current >= SLOW_LOAD_MS);

    const retryIndex = autoRetryCountRef.current;
    if (retryIndex < AUTO_RETRY_DELAYS_MS.length) {
      autoRetryCountRef.current += 1;
      recoveryTimerRef.current = setTimeout(() => {
        video.load();
        video.muted = false;
        const attempt = video.play();
        if (attempt && typeof attempt.catch === "function") {
          attempt.catch(() => {});
        }
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
  }, [clearRecoveryTimer, diagnose]);

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
        onCanPlay={markReady}
        onPlaying={markReady}
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
