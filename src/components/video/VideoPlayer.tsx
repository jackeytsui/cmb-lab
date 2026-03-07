"use client";

import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerProps } from "@mux/mux-player-react";

export interface VideoPlayerProps {
  /** Mux playback ID (not asset ID) */
  playbackId: string;
  /** Video title for analytics */
  title?: string;
  /** Custom poster image URL, or uses Mux thumbnail if not provided */
  poster?: string;
  /** Time in seconds to use for auto-generated thumbnail */
  thumbnailTime?: number;
  /** Callback when video ends */
  onEnded?: () => void;
  /** Callback when video plays */
  onPlay?: () => void;
  /** Callback when video pauses */
  onPause?: () => void;
  /** Callback with current time during playback */
  onTimeUpdate?: (currentTime: number) => void;
  /** Additional class names */
  className?: string;
  /** Accent color for controls (hex without #) */
  accentColor?: string;
  /** Autoplay video on load */
  autoPlay?: boolean;
  /** Mute video on load */
  muted?: boolean;
}

export function VideoPlayer({
  playbackId,
  title,
  poster,
  thumbnailTime = 0,
  onEnded,
  onPlay,
  onPause,
  onTimeUpdate,
  className,
  accentColor = "6366f1", // Indigo as default
  autoPlay = false,
  muted = false,
}: VideoPlayerProps) {
  const handleTimeUpdate = (event: Event) => {
    if (onTimeUpdate) {
      const player = event.target as HTMLVideoElement;
      onTimeUpdate(player.currentTime);
    }
  };

  return (
    <div className={className}>
      <MuxPlayer
        playbackId={playbackId}
        streamType="on-demand"
        // Playback controls
        playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
        // Poster/thumbnail - use custom or auto-generate from Mux
        poster={poster}
        thumbnailTime={thumbnailTime}
        // Autoplay control
        autoPlay={autoPlay}
        muted={muted}
        // Mux Data analytics metadata
        metadata={{
          video_title: title || "Untitled",
          player_name: "CantoMando Blueprint",
        }}
        // Event callbacks
        onEnded={onEnded}
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={handleTimeUpdate as MuxPlayerProps["onTimeUpdate"]}
        // Styling
        style={{ width: "100%", aspectRatio: "16/9" }}
        accentColor={`#${accentColor}`}
        // Theme - dark mode friendly
        primaryColor="#ffffff"
        secondaryColor="#a1a1aa"
      />
    </div>
  );
}
