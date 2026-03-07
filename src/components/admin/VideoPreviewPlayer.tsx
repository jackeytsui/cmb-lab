"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import type { Interaction } from "@/db/schema/interactions";

export interface VideoPreviewPlayerProps {
  /** Mux playback ID */
  playbackId: string;
  /** Current time in seconds (for synchronization) */
  currentTime: number;
  /** Callback when video time updates during playback */
  onTimeUpdate: (time: number) => void;
  /** Callback when user clicks to select a timestamp */
  onTimeSelect: (time: number) => void;
  /** List of interactions for displaying markers */
  interactions: Interaction[];
  /** Video duration in seconds (optional, will be detected) */
  duration?: number;
}

/**
 * Format seconds to MM:SS display
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Video preview player for admin interaction editor.
 *
 * Features:
 * - Displays current timestamp prominently
 * - Keyboard shortcuts for precise seeking
 * - Visual markers for existing interactions
 * - Click on progress bar area to select timestamp
 */
export function VideoPreviewPlayer({
  playbackId,
  currentTime,
  onTimeUpdate,
  onTimeSelect,
  interactions,
  duration: initialDuration,
}: VideoPreviewPlayerProps) {
  const playerRef = useRef<MuxPlayerElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(initialDuration || 0);

  // Handle time updates from player
  const handleTimeUpdate = useCallback((event: Event) => {
    const player = event.target as HTMLVideoElement;
    onTimeUpdate(player.currentTime);
  }, [onTimeUpdate]);

  // Handle duration loaded
  const handleLoadedMetadata = useCallback((event: Event) => {
    const player = event.target as HTMLVideoElement;
    setDuration(player.duration);
  }, []);

  // Seek to specific time
  const seekTo = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  }, [duration]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (playerRef.current) {
      if (playerRef.current.paused) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if container is focused or focused element is within container
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== containerRef.current) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(currentTime - (e.shiftKey ? 5 : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(currentTime + (e.shiftKey ? 5 : 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, seekTo, togglePlayPause]);

  // Handle click on timeline area to select timestamp
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const selectedTime = Math.floor(percentage * duration);

    // Seek to the time and notify
    seekTo(selectedTime);
    onTimeSelect(selectedTime);
  }, [seekTo, onTimeSelect, duration]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg bg-black"
      tabIndex={0}
    >
      {/* Video Player */}
      <MuxPlayer
        ref={playerRef}
        playbackId={playbackId}
        streamType="on-demand"
        autoPlay={false}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        style={{ width: "100%", aspectRatio: "16/9" }}
        accentColor="#6366f1"
        primaryColor="#ffffff"
        secondaryColor="#a1a1aa"
      />

      {/* Current Time Display */}
      <div className="absolute left-4 top-4 rounded-md bg-black/80 px-3 py-1.5 text-lg font-mono text-white shadow-lg">
        {formatTime(currentTime)}
      </div>

      {/* Interaction Markers on Timeline */}
      <div
        className="relative mt-2 h-6 cursor-pointer rounded bg-zinc-700"
        onClick={handleTimelineClick}
      >
        {/* Progress indicator */}
        <div
          className="absolute inset-y-0 left-0 rounded bg-indigo-600/30"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />

        {/* Interaction markers */}
        {interactions.map((interaction) => {
          const position = duration > 0
            ? (interaction.timestamp / duration) * 100
            : 0;
          return (
            <div
              key={interaction.id}
              className={`absolute top-1 h-4 w-2 -translate-x-1/2 rounded-full ${
                interaction.type === "text"
                  ? "bg-cyan-500"
                  : "bg-purple-500"
              }`}
              style={{ left: `${position}%` }}
              title={`${interaction.type} at ${formatTime(interaction.timestamp)}`}
            />
          );
        })}

        {/* Current time indicator */}
        <div
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-white"
          style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>

      {/* Keyboard shortcuts hint */}
      <p className="mt-2 text-xs text-zinc-500">
        Shortcuts: Space=play/pause, Left/Right=seek 1s, Shift+Left/Right=seek 5s
      </p>
    </div>
  );
}
