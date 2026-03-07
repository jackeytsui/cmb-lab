"use client";

/**
 * SaveVocabularyButton — Bookmark toggle with optimistic UI.
 *
 * Shows a filled amber bookmark when saved, outline zinc bookmark when unsaved.
 * Disabled with reduced opacity during loading (save/unsave in flight).
 */

import { Bookmark, Loader2 } from "lucide-react";

export interface SaveVocabularyButtonProps {
  isSaved: boolean;
  isLoading: boolean;
  onToggle: () => void;
}

export function SaveVocabularyButton({
  isSaved,
  isLoading,
  onToggle,
}: SaveVocabularyButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isLoading}
      className={`rounded-md p-1.5 transition-all hover:scale-105 disabled:opacity-50 ${
        isSaved
          ? "text-amber-400 hover:bg-amber-500/10"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground/90"
      }`}
      title={isSaved ? "Remove from vocabulary" : "Save to vocabulary"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bookmark
          className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
        />
      )}
    </button>
  );
}
