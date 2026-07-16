"use client";

import { useEffect, useRef, useState } from "react";

interface LessonVideoPlayerProps {
  /** Authenticated stream endpoint for this lesson's video. */
  src: string;
}

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
 * authenticated proxy, which can take a few seconds) we show a short overlay
 * so students know to wait instead of refreshing or leaving.
 */
export function LessonVideoPlayer({ src }: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // If it's already buffered (e.g. cached), don't show the overlay.
    if (video.readyState >= 3) setLoading(false);
    // Guarantee muted is set before attempting playback so the browser's
    // autoplay policy permits it.
    video.muted = true;
    const attempt = video.play();
    // play() rejects if the browser still blocks it; ignore so it doesn't
    // throw an unhandled rejection — the student can press play manually.
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {});
    }
  }, [src]);

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
        onCanPlay={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
      />
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm font-medium text-white">Loading your video…</p>
          <p className="max-w-xs text-xs text-white/70">
            This can take up to 10 seconds. Please don&apos;t refresh or leave
            the page — it&apos;ll start playing automatically.
          </p>
        </div>
      )}
    </div>
  );
}
