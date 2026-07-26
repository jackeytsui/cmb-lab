"use client";

import { useMuxPlayback } from "@/hooks/useMuxPlayback";

interface MuxThumbnailProps {
  playbackId: string;
  /**
   * Query params for image.mux.com, e.g. "width=320&height=180". Only
   * applied on the tokenless fallback path: signed image URLs reject query
   * params that aren't baked into the token, so sizing is left to CSS there.
   */
  params?: string;
  alt: string;
  className?: string;
}

/**
 * Thumbnail for a Mux asset under the signed playback policy: image.mux.com
 * requires a thumbnail token, so the image URL is built from the resolved
 * playback ID + token instead of the bare stored ID.
 */
export function MuxThumbnail({
  playbackId,
  params,
  alt,
  className,
}: MuxThumbnailProps) {
  const { playbackId: resolvedId, tokens, ready } = useMuxPlayback(playbackId);

  if (!ready || !resolvedId) {
    return <div className={className} aria-hidden />;
  }

  const query = tokens ? `token=${tokens.thumbnail}` : params;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://image.mux.com/${resolvedId}/thumbnail.webp${query ? `?${query}` : ""}`}
      alt={alt}
      className={className}
    />
  );
}
