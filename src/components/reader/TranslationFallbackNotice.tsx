"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, RotateCcw } from "lucide-react";

const MANUAL_FALLBACK_DELAY_MS = 2_000;

export function TranslationFallbackNotice({
  hasTranslation,
  isTranslating,
  translationFailed,
  onAddManualTranslation,
  onRetryTranslation,
}: {
  hasTranslation: boolean;
  isTranslating: boolean;
  translationFailed: boolean;
  onAddManualTranslation?: () => void;
  onRetryTranslation?: () => void;
}) {
  if (hasTranslation) return null;

  if (!translationFailed) {
    return isTranslating ? (
      <SlowTranslationNotice
        onAddManualTranslation={onAddManualTranslation}
      />
    ) : null;
  }

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3.5 shrink-0" />
        Automatic translation is unavailable.
      </span>
      {onAddManualTranslation ? (
        <button
          type="button"
          onClick={onAddManualTranslation}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
        >
          <Pencil className="size-3" />
          Add English manually
        </button>
      ) : null}
      {onRetryTranslation ? (
        <button
          type="button"
          onClick={onRetryTranslation}
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <RotateCcw className="size-3" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

function SlowTranslationNotice({
  onAddManualTranslation,
}: {
  onAddManualTranslation?: () => void;
}) {
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setIsTakingLonger(true),
      MANUAL_FALLBACK_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  if (!isTakingLonger) return null;

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        Translation is taking longer than expected.
      </span>
      {onAddManualTranslation ? (
        <button
          type="button"
          onClick={onAddManualTranslation}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
        >
          <Pencil className="size-3" />
          Add English manually
        </button>
      ) : null}
    </div>
  );
}
