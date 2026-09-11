/**
 * MediaRecorder's WebM output is commonly missing final container metadata
 * (duration, SeekHead, and Cues). Without it Chromium can play sequentially
 * but cannot reliably seek. Rebuild that metadata before uploading while
 * keeping the encoded audio/video bytes unchanged.
 */
export async function makeWebmSeekable(blob: Blob): Promise<Blob> {
  const contentType = blob.type.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "audio/webm" && contentType !== "video/webm") {
    return blob;
  }

  // Keep the EBML parser out of the initial assignment bundle. It is only
  // needed after a WebM recording has stopped.
  const { default: fixWebmMetaInfo } = await import("fix-webm-metainfo");
  const fixed = await fixWebmMetaInfo(blob);
  if (fixed.size === 0) {
    throw new Error("The WebM metadata repair produced an empty recording.");
  }

  return fixed;
}
