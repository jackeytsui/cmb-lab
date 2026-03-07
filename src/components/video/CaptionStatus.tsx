"use client";

import { Loader2, CheckCircle2, AlertTriangle, XCircle, Mic } from "lucide-react";

type CaptionStatusType =
  | "idle"
  | "loading"
  | "success"
  | "no_captions"
  | "provider_blocked"
  | "error"
  | "transcribing"
  | "unsupported_language";

interface CaptionStatusProps {
  status: CaptionStatusType;
  captionCount: number;
  onTranscribe?: () => void;
  transcribeError?: string | null;
}

/**
 * CaptionStatus -- Displays the current state of caption extraction.
 *
 * States:
 *   idle      - Hidden (no video loaded yet)
 *   loading   - Spinner with "Extracting captions..." text
 *   success   - Green checkmark with caption count
 *   no_captions - Amber warning with upload suggestion
 *   error     - Red X with upload fallback suggestion
 */
export function CaptionStatus({
  status,
  captionCount,
  onTranscribe,
  transcribeError,
}: CaptionStatusProps) {
  if (status === "idle") {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {status === "loading" && (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Extracting captions...
          </span>
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <span className="text-sm text-emerald-500">
            {captionCount} caption{captionCount !== 1 ? "s" : ""} loaded
          </span>
        </div>
      )}

      {status === "no_captions" && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-500">
              No Chinese captions found
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-transcribe with AI or upload an SRT/VTT file below
            </p>
            {onTranscribe && (
              <button
                type="button"
                onClick={onTranscribe}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
              >
                <Mic className="h-3.5 w-3.5" />
                Auto-transcribe with AI
              </button>
            )}
            {transcribeError && (
              <p className="mt-1.5 text-xs text-red-400">{transcribeError}</p>
            )}
          </div>
        </div>
      )}

      {status === "provider_blocked" && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-500">
              YouTube temporarily blocked transcript access
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Please upload an SRT/VTT file below for this video.
            </p>
          </div>
        </div>
      )}

      {status === "transcribing" && (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
          <div>
            <span className="text-sm text-cyan-500">
              Transcribing audio with AI...
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              This may take up to a minute depending on video length
            </p>
          </div>
        </div>
      )}

      {status === "unsupported_language" && (
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-500">
              Captions aren&apos;t detected as Mandarin or Cantonese
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Try a different YouTube video or upload an SRT/VTT file
            </p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-500">
              Failed to extract captions
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You can upload an SRT or VTT file instead
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
