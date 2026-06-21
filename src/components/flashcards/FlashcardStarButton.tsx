"use client";

import { Bookmark, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlashcardStarButtonProps {
  isSaved: boolean;
  isLoading?: boolean;
  onToggle: () => void;
  label?: string;
  variant?: "star" | "bookmark";
  compact?: boolean;
}

export function FlashcardStarButton({
  isSaved,
  isLoading = false,
  onToggle,
  label,
  variant = "star",
  compact = false,
}: FlashcardStarButtonProps) {
  const Icon = variant === "bookmark" ? Bookmark : Star;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isLoading}
      aria-pressed={isSaved}
      aria-label={label ?? (isSaved ? "Remove from flashcards" : "Save to flashcards")}
      title={label ?? (isSaved ? "Remove from flashcards" : "Save to flashcards")}
      className={cn(
        "inline-flex items-center justify-center rounded transition-colors disabled:opacity-50",
        compact ? "size-5" : "size-6",
        isSaved
          ? "text-amber-500 hover:bg-amber-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      {isLoading ? (
        <Loader2 className={cn(compact ? "size-3" : "size-3.5", "animate-spin")} />
      ) : (
        <Icon className={cn(compact ? "size-3" : "size-3.5", isSaved && "fill-current")} />
      )}
    </button>
  );
}
