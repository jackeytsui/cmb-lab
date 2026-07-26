"use client";

import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerProps } from "@mux/mux-player-react";
import { useMuxPlayback } from "@/hooks/useMuxPlayback";

type SignedMuxPlayerProps = Omit<MuxPlayerProps, "playbackId" | "tokens"> & {
  playbackId: string | undefined;
};

/**
 * Drop-in MuxPlayer that plays under the signed playback policy: resolves
 * the stored playback ID to a current ID + short-lived tokens before
 * mounting the player. Use this instead of a bare <MuxPlayer> anywhere a
 * ref to the underlying player element isn't needed.
 */
export function SignedMuxPlayer({
  playbackId,
  className,
  ...rest
}: SignedMuxPlayerProps) {
  const playback = useMuxPlayback(playbackId);

  if (!playback.ready || !playback.playbackId) {
    return <div className={className} aria-hidden />;
  }

  return (
    <MuxPlayer
      {...rest}
      className={className}
      playbackId={playback.playbackId}
      tokens={playback.tokens}
    />
  );
}
