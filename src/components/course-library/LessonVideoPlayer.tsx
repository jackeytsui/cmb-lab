"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface LessonVideoPlayerProps {
  /** Authenticated stream endpoint for this lesson's video. */
  src: string;
}

/** How long the first-load overlay waits before admitting something is slow. */
const SLOW_LOAD_MS = 15000;

/**
 * Native <video> player for Course Library lessons.
 *
 * Rendered as a client component so autoplay actually works: React does not
 * emit the `muted` attribute into server-rendered HTML (it only sets the
 * `muted` DOM property after hydration), so a server-rendered
 * `<video autoplay muted>` is parsed as unmuted — and browsers block unmuted
 * autoplay. Here we set `muted` on the element imperatively and call play()
 * on mount, which browsers allow. The student unmutes from the controls.
 *
 * While the video buffers for the first time (it streams through an
 * authenticated proxy) we show a short overlay so students know to wait.
 * Unlike the old player, failures are surfaced: a media error swaps the
 * spinner for an explicit error state with a Retry button, and if nothing has
 * loaded after SLOW_LOAD_MS the overlay offers a retry instead of telling the
 * student to keep waiting forever.
 */
export function LessonVideoPlayer({ src }: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [slow, setSlow] = useState(false);

  // Slow-load watchdog: if we're still loading after SLOW_LOAD_MS, stop
  // promising it will start automatically and offer a retry.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [status, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // If it's already buffered (e.g. cached, or canplay fired before
    // hydration attached our listeners), skip the overlay. Checked in a
    // frame callback so the effect body stays free of synchronous setState.
    const raf = requestAnimationFrame(() => {
      if (video.readyState >= 3) setStatus("ready");
    });
    // Guarantee muted is set before attempting playback so the browser's
    // autoplay policy permits it.
    video.muted = true;
    const attempt = video.play();
    // play() rejects if the browser still blocks it; ignore so it doesn't
    // throw an unhandled rejection — the student can press play manually.
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {});
    }
    return () => cancelAnimationFrame(raf);
  }, [src]);

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setSlow(false);
    setStatus("loading");
    // load() re-issues the request from scratch (fresh auth cookies included),
    // which recovers from transient network/session hiccups.
    video.load();
    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {});
    }
  }, []);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        muted
        autoPlay
        preload="metadata"
        controlsList="nodownload"
        className="h-full w-full"
        onLoadedMetadata={() => setStatus("ready")}
        onCanPlay={() => setStatus("ready")}
        onPlaying={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm font-medium text-white">Loading your video…</p>
          {slow ? (
            <>
              <p className="max-w-xs text-xs text-white/70">
                This is taking longer than it should. Your connection may be
                slow — you can keep waiting, or try reloading the video.
              </p>
              <button
                type="button"
                onClick={retry}
                className="pointer-events-auto rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Reload video
              </button>
            </>
          ) : (
            <p className="max-w-xs text-xs text-white/70">
              This can take up to 10 seconds. Please don&apos;t refresh or
              leave the page — it&apos;ll start playing automatically.
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
        </div>
      )}
    </div>
  );
}
