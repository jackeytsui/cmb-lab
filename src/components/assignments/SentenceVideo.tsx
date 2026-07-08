"use client";

// ---------------------------------------------------------------------------
// Non-downloadable coach video that sizes itself to the uploaded file's own
// aspect ratio. A <video> is a replaced element, so with auto width/height and
// both a max-width and max-height it renders at its intrinsic dimensions
// clamped to that box while preserving aspect ratio — portrait clips come out
// tall & narrow, landscape wide & short, square square — all kept compact.
// Shared by the student and reviewer Vocal Hack screens.
// ---------------------------------------------------------------------------

export function SentenceVideo({ src }: { src: string }) {
  return (
     
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      className="h-auto max-h-72 w-auto max-w-[240px] rounded-lg bg-black"
    />
  );
}
