"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FlashcardItem = {
  id: string;
  source: "coaching" | "vocabulary";
  chinese: string;
  simplified?: string;
  pinyin?: string;
  jyutping?: string;
  romanization: string;
  english: string;
  pane?: string; // "mandarin" | "cantonese" for coaching notes
  createdAt: string;
  noteId?: string;
  vocabId?: string;
};

type ScriptMode = "traditional" | "simplified";
type SourceFilter = "all" | "coaching" | "vocabulary";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];

function SpeakButton({ text, lang }: { text: string; lang: "zh-CN" | "zh-HK" }) {
  const [speed, setSpeed] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeak = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = speed;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleSpeak}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors",
          isSpeaking
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-input bg-background text-muted-foreground hover:text-foreground",
        )}
        title={`Play (${lang === "zh-CN" ? "Mandarin" : "Cantonese"})`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        {speed}x
      </button>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="rounded border border-input bg-background px-1 py-0.5 text-[10px] text-muted-foreground"
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}x</option>
        ))}
      </select>
    </div>
  );
}

function FlashCard({
  card,
  isFlipped,
  scriptMode,
  onFlip,
  onRemove,
}: {
  card: FlashcardItem;
  isFlipped: boolean;
  scriptMode: ScriptMode;
  onFlip: () => void;
  onRemove: () => void;
}) {
  const displayChinese =
    scriptMode === "simplified" && card.simplified
      ? card.simplified
      : card.chinese;

  // Determine language for TTS
  const lang: "zh-CN" | "zh-HK" =
    card.pane === "cantonese" ? "zh-HK" : "zh-CN";

  // Determine romanization display
  const romanLabel =
    card.pane === "cantonese"
      ? card.jyutping || card.romanization
      : card.pane === "mandarin"
        ? card.pinyin || card.romanization
        : card.romanization;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onFlip}
        className="w-full cursor-pointer text-left"
        style={{ perspective: "800px" }}
      >
        <div
          className={cn(
            "relative min-h-[150px] w-full rounded-lg border border-border bg-card shadow-sm transition-transform duration-500",
            isFlipped && "[transform:rotateY(180deg)]",
          )}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg p-4"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-2xl font-bold text-foreground">
              {displayChinese}
            </span>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg p-4 [transform:rotateY(180deg)]"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-xl font-bold text-foreground">
              {displayChinese}
            </span>
            {romanLabel && (
              <span className="text-sm text-blue-400">{romanLabel}</span>
            )}
            {card.english && (
              <span className="text-center text-xs text-muted-foreground">
                {card.english}
              </span>
            )}
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <SpeakButton text={displayChinese} lang={lang} />
            </div>
          </div>
        </div>
      </button>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="Remove from flashcards"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

export function FlashcardsClient() {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [scriptMode, setScriptMode] = useState<ScriptMode>("traditional");
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [allFlipped, setAllFlipped] = useState(false);

  // Study mode
  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);
  const [studySpeed, setStudySpeed] = useState(1);
  const studySpeakingRef = useRef(false);

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

  // Split cards by language
  const cantoneseCards = useMemo(
    () => filteredCards.filter((c) => c.pane === "cantonese"),
    [filteredCards],
  );
  const mandarinCards = useMemo(
    () => filteredCards.filter((c) => c.pane === "mandarin" || !c.pane),
    [filteredCards],
  );

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMassFlip = () => {
    const nextState = !allFlipped;
    setAllFlipped(nextState);
    if (nextState) {
      setFlippedCards(new Set(filteredCards.map((c) => c.id)));
    } else {
      setFlippedCards(new Set());
    }
  };

  const handleRemove = async (card: FlashcardItem) => {
    if (card.source === "coaching" && card.noteId) {
      await fetch(`/api/coaching/notes/${card.noteId}/star`, { method: "DELETE" });
    } else if (card.source === "vocabulary" && card.vocabId) {
      await fetch(`/api/vocabulary?id=${card.vocabId}`, { method: "DELETE" });
    }
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  };

  // Study mode
  const studyCard = filteredCards[studyIndex] ?? null;

  const handleStudyNext = useCallback(() => {
    setStudyFlipped(false);
    setStudyIndex((i) => Math.min(i + 1, filteredCards.length - 1));
  }, [filteredCards.length]);

  const handleStudyPrev = useCallback(() => {
    setStudyFlipped(false);
    setStudyIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleStudySpeak = useCallback(() => {
    if (!studyCard || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const displayChinese =
      scriptMode === "simplified" && studyCard.simplified
        ? studyCard.simplified
        : studyCard.chinese;
    const lang = studyCard.pane === "cantonese" ? "zh-HK" : "zh-CN";
    const utterance = new SpeechSynthesisUtterance(displayChinese);
    utterance.lang = lang;
    utterance.rate = studySpeed;
    utterance.onstart = () => { studySpeakingRef.current = true; };
    utterance.onend = () => { studySpeakingRef.current = false; };
    window.speechSynthesis.speak(utterance);
  }, [studyCard, scriptMode, studySpeed]);

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
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        handleStudySpeak();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [studyMode, handleStudyNext, handleStudyPrev, handleStudySpeak]);

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
    const studyDisplayChinese =
      scriptMode === "simplified" && studyCard.simplified
        ? studyCard.simplified
        : studyCard.chinese;
    const studyLang: "zh-CN" | "zh-HK" =
      studyCard.pane === "cantonese" ? "zh-HK" : "zh-CN";
    const studyRoman =
      studyCard.pane === "cantonese"
        ? studyCard.jyutping || studyCard.romanization
        : studyCard.pane === "mandarin"
          ? studyCard.pinyin || studyCard.romanization
          : studyCard.romanization;

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
              <span className="text-4xl font-bold text-foreground">
                {studyDisplayChinese}
              </span>
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
                {studyDisplayChinese}
              </span>
              {studyRoman && (
                <span className="text-lg text-blue-400">{studyRoman}</span>
              )}
              {studyCard.english && (
                <span className="mt-2 text-center text-base text-muted-foreground">
                  {studyCard.english}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Play + speed + nav controls */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleStudyPrev}
            disabled={studyIndex === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            &larr; Prev
          </button>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleStudySpeak}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play
            </button>
            <select
              value={studySpeed}
              onChange={(e) => setStudySpeed(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </div>
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
          Space to flip &middot; P to play &middot; Arrow keys to navigate &middot; Esc to exit
        </p>
      </div>
    );
  }

  // Grid view — split Cantonese (left) and Mandarin (right)
  const renderColumn = (title: string, columnCards: FlashcardItem[]) => (
    <div className="flex-1 min-w-0">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title} ({columnCards.length})
      </h3>
      {columnCards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No {title.toLowerCase()} cards yet
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {columnCards.map((card) => (
            <FlashCard
              key={card.id}
              card={card}
              isFlipped={flippedCards.has(card.id)}
              scriptMode={scriptMode}
              onFlip={() => toggleFlip(card.id)}
              onRemove={() => handleRemove(card)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Script toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["traditional", "simplified"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScriptMode(mode)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                scriptMode === mode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "traditional" ? "Traditional" : "Simplified"}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              ["all", `All (${cards.length})`],
              ["coaching", `Coaching`],
              ["vocabulary", `Vocabulary`],
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

        {/* Mass flip */}
        <button
          type="button"
          onClick={handleMassFlip}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          {allFlipped ? "Hide All Answers" : "Show All Answers"}
        </button>

        {/* Study mode button */}
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
            Study Mode ({filteredCards.length})
          </button>
        )}
      </div>

      {/* Two-column layout: Cantonese | Mandarin */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {renderColumn("Cantonese", cantoneseCards)}
        <div className="hidden lg:block w-px bg-border" />
        {renderColumn("Mandarin", mandarinCards)}
      </div>
    </div>
  );
}
