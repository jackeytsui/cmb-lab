"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type FlashcardItem = {
  id: string;
  source: "coaching" | "vocabulary";
  sourceLabel: string;
  sessionTitle?: string;
  chinese: string;
  simplified?: string;
  romanization: string;
  english: string;
  pane?: string;
  createdAt: string;
  noteId?: string;
  vocabId?: string;
};

type SourceFilter = "all" | "coaching" | "vocabulary";

export function FlashcardsClient() {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/flashcards");
      if (!res.ok) throw new Error("Failed to load flashcards");
      const data = await res.json();
      setCards(data.cards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const filteredCards = useMemo(
    () =>
      sourceFilter === "all"
        ? cards
        : cards.filter((c) => c.source === sourceFilter),
    [cards, sourceFilter],
  );

  const coachingCount = useMemo(() => cards.filter((c) => c.source === "coaching").length, [cards]);
  const vocabCount = useMemo(() => cards.filter((c) => c.source === "vocabulary").length, [cards]);

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemove = async (card: FlashcardItem) => {
    if (card.source === "coaching" && card.noteId) {
      await fetch(`/api/coaching/notes/${card.noteId}/star`, { method: "DELETE" });
    } else if (card.source === "vocabulary" && card.vocabId) {
      await fetch(`/api/vocabulary?id=${card.vocabId}`, { method: "DELETE" });
    }
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  };

  // Study mode navigation
  const studyCard = filteredCards[studyIndex] ?? null;

  const handleStudyNext = () => {
    setStudyFlipped(false);
    setStudyIndex((i) => Math.min(i + 1, filteredCards.length - 1));
  };
  const handleStudyPrev = () => {
    setStudyFlipped(false);
    setStudyIndex((i) => Math.max(i - 1, 0));
  };

  // Keyboard support for study mode
  useEffect(() => {
    if (!studyMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setStudyFlipped((f) => !f);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleStudyNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handleStudyPrev();
      } else if (e.key === "Escape") {
        setStudyMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [studyMode, filteredCards.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-lg font-medium text-foreground">No flashcards yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Star notes in your coaching sessions or save vocabulary from the AI Passage Reader and YouTube Listening Lab to build your flashcard deck.
        </p>
      </div>
    );
  }

  // Study mode — single card at a time
  if (studyMode && studyCard) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => setStudyMode(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to all cards
          </button>
          <span className="text-sm text-muted-foreground">
            {studyIndex + 1} / {filteredCards.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setStudyFlipped((f) => !f)}
          className="group w-full max-w-lg cursor-pointer"
          style={{ perspective: "1000px" }}
        >
          <div
            className={cn(
              "relative min-h-[280px] w-full rounded-xl border border-border bg-card shadow-lg transition-transform duration-500",
              studyFlipped && "[transform:rotateY(180deg)]",
            )}
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl p-6"
              style={{ backfaceVisibility: "hidden" }}
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {studyCard.sourceLabel}
              </span>
              <span className="text-4xl font-bold text-foreground">
                {studyCard.chinese}
              </span>
              {studyCard.simplified && studyCard.simplified !== studyCard.chinese && (
                <span className="text-lg text-muted-foreground">{studyCard.simplified}</span>
              )}
              <span className="mt-4 text-xs text-muted-foreground">
                Click or press Space to flip
              </span>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl p-6 [transform:rotateY(180deg)]"
              style={{ backfaceVisibility: "hidden" }}
            >
              <span className="text-4xl font-bold text-foreground">
                {studyCard.chinese}
              </span>
              {studyCard.romanization && (
                <span className="text-lg text-blue-400">
                  {studyCard.romanization}
                </span>
              )}
              {studyCard.english && (
                <span className="mt-2 text-center text-base text-muted-foreground">
                  {studyCard.english}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleStudyPrev}
            disabled={studyIndex === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            &larr; Previous
          </button>
          <button
            type="button"
            onClick={handleStudyNext}
            disabled={studyIndex >= filteredCards.length - 1}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            Next &rarr;
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Space/Enter to flip &middot; Arrow keys to navigate &middot; Esc to exit
        </p>
      </div>
    );
  }

  // Grid view
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              ["all", `All (${cards.length})`],
              ["coaching", `Coaching (${coachingCount})`],
              ["vocabulary", `Vocabulary (${vocabCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                sourceFilter === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredCards.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setStudyIndex(0);
              setStudyFlipped(false);
              setStudyMode(true);
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Study Mode ({filteredCards.length} cards)
          </button>
        )}
      </div>

      {filteredCards.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No cards match the current filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCards.map((card) => {
            const isFlipped = flippedCards.has(card.id);
            return (
              <div key={card.id} className="group relative">
                <button
                  type="button"
                  onClick={() => toggleFlip(card.id)}
                  className="w-full cursor-pointer text-left"
                  style={{ perspective: "800px" }}
                >
                  <div
                    className={cn(
                      "relative min-h-[160px] w-full rounded-lg border border-border bg-card shadow-sm transition-transform duration-500",
                      isFlipped && "[transform:rotateY(180deg)]",
                    )}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* Front */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg p-4"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        {card.sourceLabel}
                      </span>
                      <span className="text-2xl font-bold text-foreground">
                        {card.chinese}
                      </span>
                      {card.simplified && card.simplified !== card.chinese && (
                        <span className="text-sm text-muted-foreground">{card.simplified}</span>
                      )}
                    </div>

                    {/* Back */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg p-4 [transform:rotateY(180deg)]"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <span className="text-xl font-bold text-foreground">
                        {card.chinese}
                      </span>
                      {card.romanization && (
                        <span className="text-sm text-blue-400">
                          {card.romanization}
                        </span>
                      )}
                      {card.english && (
                        <span className="text-center text-xs text-muted-foreground">
                          {card.english}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(card)}
                  className="absolute right-2 top-2 z-10 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Remove from flashcards"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
