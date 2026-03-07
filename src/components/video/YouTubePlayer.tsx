"use client";

import { useCallback, useRef } from "react";
import YouTube, { type YouTubeEvent, type YouTubePlayer as YTPlayer } from "react-youtube";
import { cn } from "@/lib/utils";

interface YouTubePlayerProps {
  videoId: string;
  onReady?: (player: YTPlayer) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function YouTubePlayer({ videoId, onReady, onPlay, onPause, onEnd, className, children }: YouTubePlayerProps) {
  const playerRef = useRef<YTPlayer | null>(null);

  const handleReady = useCallback(
    (event: YouTubeEvent) => {
      playerRef.current = event.target;
      onReady?.(event.target);
    },
    [onReady]
  );

  return (
    <div className={cn("aspect-video relative overflow-hidden", className)}>
      <YouTube
        videoId={videoId}
        iframeClassName="w-full h-full rounded-lg"
        className="w-full h-full"
        onReady={handleReady}
        onPlay={onPlay ? () => onPlay() : undefined}
        onPause={onPause ? () => onPause() : undefined}
        onEnd={onEnd ? () => onEnd() : undefined}
        opts={{
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            cc_load_policy: 0, // hide built-in captions (we render our own)
          },
        }}
      />
      {children}
    </div>
  );
}
