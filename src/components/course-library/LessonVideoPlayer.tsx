"use client";

import { useEffect, useRef } from "react";

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
 */
export function LessonVideoPlayer({ src }: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
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
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      muted
      autoPlay
      preload="metadata"
      controlsList="nodownload"
      className="w-full h-full"
    />
  );
}
