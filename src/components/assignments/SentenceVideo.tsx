"use client";

import { Minimize2, MoveDiagonal } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Non-downloadable coach video that sizes itself to the uploaded file's own
// aspect ratio. A <video> is a replaced element, so with auto width/height and
// both a max-width and max-height it renders at its intrinsic dimensions
// clamped to that box while preserving aspect ratio — portrait clips come out
// tall & narrow, landscape wide & short, square square — all kept compact.
// Shared by the student and reviewer Vocal Hack screens.
// ---------------------------------------------------------------------------

export function SentenceVideo({
  src,
  expanded = false,
  onExpandedChange,
}: {
  src: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  return (
    <div className={cn("space-y-2", expanded && "w-full")}>
      <video
        aria-label="Coach example video"
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "h-auto w-full rounded-lg bg-black object-contain",
          expanded
            ? "max-h-[70vh] max-w-full"
            : "max-h-96 max-w-full sm:w-auto sm:max-w-[360px]",
        )}
      />
      {onExpandedChange && (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          {expanded ? (
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <MoveDiagonal className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {expanded ? "Compact video" : "Enlarge video"}
        </button>
      )}
    </div>
  );
}
