"use client";

import { useEffect, useState } from "react";

export interface MuxPlaybackTokens {
  playback: string;
  thumbnail: string;
  storyboard: string;
}

export interface MuxPlaybackState {
  /** Playback ID to hand to the player (may differ from the stored one). */
  playbackId: string | undefined;
  /** Signed tokens, or undefined when playing tokenless (fallback). */
  tokens: MuxPlaybackTokens | undefined;
  /** False while the token fetch is in flight — don't mount the player yet. */
  ready: boolean;
}

/**
 * Resolves a stored Mux playback ID into a playable (ID, tokens) pair via
 * /api/video/playback-token. All Mux assets use the signed playback policy,
 * so the player must attach these tokens to every request.
 *
 * If the token endpoint fails, we fall back to rendering with the stored ID
 * and no tokens rather than showing nothing: assets not yet converted to
 * signed still play that way, and for converted ones the player surfaces a
 * clear media error instead of an blank box.
 */
export function useMuxPlayback(
  requestedPlaybackId: string | null | undefined,
): MuxPlaybackState {
  const [resolved, setResolved] = useState<{
    forId: string;
    playbackId: string;
    tokens: MuxPlaybackTokens;
  } | null>(null);
  const [failedForId, setFailedForId] = useState<string | null>(null);

  useEffect(() => {
    if (!requestedPlaybackId) return;
    let alive = true;
    fetch(
      `/api/video/playback-token?playbackId=${encodeURIComponent(requestedPlaybackId)}`,
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data) => {
        if (!alive) return;
        setResolved({
          forId: requestedPlaybackId,
          playbackId: data.playbackId,
          tokens: data.tokens,
        });
      })
      .catch(() => {
        if (alive) setFailedForId(requestedPlaybackId);
      });
    return () => {
      alive = false;
    };
  }, [requestedPlaybackId]);

  if (!requestedPlaybackId) {
    return { playbackId: undefined, tokens: undefined, ready: false };
  }
  if (resolved && resolved.forId === requestedPlaybackId) {
    return { playbackId: resolved.playbackId, tokens: resolved.tokens, ready: true };
  }
  if (failedForId === requestedPlaybackId) {
    return { playbackId: requestedPlaybackId, tokens: undefined, ready: true };
  }
  return { playbackId: undefined, tokens: undefined, ready: false };
}
