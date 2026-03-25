"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Volume2, Check, X } from "lucide-react";
import { useTTS } from "@/hooks/useTTS";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SentenceSide {
  id: string;
  chineseText: string;
  romanisation: string;
}

export interface PhrasePair {
  sortOrder: number;
  english: string;
  cantonese: SentenceSide | null;
  mandarin: SentenceSide | null;
}

interface TypingDrillClientProps {
  pairs: PhrasePair[];
  initialCompletedIds: string[];
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeForComparison(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\uFEFF\uFFFD]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .replace(
      /[,.\u3001\u3002\uFF0C\uFF0E\uFF01\uFF1F\uFF1B\uFF1A\u201C\u201D\u2018\u2019\uFF08\uFF09\u300A\u300B\u3010\u3011\u2026\u2014\u00B7!?;:"'()<>[\]]/g,
      ""
    )
    .trim();
}

function getCharFeedback(
  input: string,
  expected: string
): Array<{ char: string; correct: boolean }> {
  const normInput = normalizeForComparison(input);
  const normExpected = normalizeForComparison(expected);
  return [...normInput].map((char, i) => ({
    char,
    correct: i < normExpected.length && char === normExpected[i],
  }));
}

// ---------------------------------------------------------------------------
// DrillSide — one language column within a phrase pair
// ---------------------------------------------------------------------------

function DrillSide({
  side,
  language,
  isCompleted,
  onComplete,
}: {
  side: SentenceSide;
  language: "cantonese" | "mandarin";
  isCompleted: boolean;
  onComplete: (id: string) => void;
}) {
  const [input, setInput] = useState(() =>
    isCompleted ? side.chineseText : ""
  );
  const [feedback, setFeedback] = useState<
    "idle" | "correct" | "wrong" | "revealed"
  >(() => (isCompleted ? "correct" : "idle"));
  const [charFeedback, setCharFeedback] = useState<
    Array<{ char: string; correct: boolean }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { speak, isPlaying } = useTTS();

  // "correct" and "revealed" are terminal — input stays locked
  const isLocked = feedback === "correct" || feedback === "revealed";

  const handleCheck = useCallback(() => {
    if (isLocked || feedback === "wrong" || !input.trim()) return;

    const isCorrect =
      normalizeForComparison(input) ===
      normalizeForComparison(side.chineseText);

    if (isCorrect) {
      setFeedback("correct");
      setCharFeedback([]);
      onComplete(side.id);
      // Stay locked — no reset
    } else {
      setFeedback("wrong");
      setCharFeedback(getCharFeedback(input, side.chineseText));
      // Let student dismiss and retry
      setTimeout(() => {
        setFeedback("idle");
        setCharFeedback([]);
        inputRef.current?.focus();
      }, 1500);
    }
  }, [isLocked, feedback, input, side.chineseText, side.id, onComplete]);

  const handleGiveUp = useCallback(() => {
    setInput(side.chineseText);
    setFeedback("revealed");
    onComplete(side.id);
    // Stay locked — skip with 0 points
  }, [side.chineseText, side.id, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCheck();
    }
  };

  const handleSpeak = () => {
    speak(side.chineseText, {
      language: language === "cantonese" ? "cantonese" : "mandarin",
    });
  };

  const isCanto = language === "cantonese";
  const labelColor = isCanto ? "text-cyan-500" : "text-red-500";
  const labelText = isCanto ? "Cantonese" : "Mandarin";

  return (
    <div className="flex-1 flex flex-col items-center gap-3 p-4 sm:p-5">
      {/* Language label */}
      <span className={`text-sm font-bold tracking-wide ${labelColor}`}>
        {labelText}
      </span>

      {/* Romanisation */}
      <p className="text-sm text-muted-foreground text-center leading-snug">
        {side.romanisation}
      </p>

      {/* Chinese characters + TTS */}
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-foreground">
          {side.chineseText}
        </span>
        <button
          type="button"
          onClick={handleSpeak}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Listen in ${labelText}`}
        >
          <Volume2
            className={`w-5 h-5 ${isPlaying ? "text-blue-500 animate-pulse" : ""}`}
          />
        </button>
      </div>

      {/* Input */}
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Type ${labelText} here`}
        className={`text-center text-lg h-12 transition-colors ${
          feedback === "correct"
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : feedback === "wrong"
              ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-300"
              : feedback === "revealed"
                ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                : ""
        }`}
        disabled={isLocked || feedback === "wrong"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Feedback */}
      {feedback === "correct" && (
        <div className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
          <Check className="w-3.5 h-3.5" />
          <span>Completed</span>
        </div>
      )}
      {feedback === "wrong" && (
        <div className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-1 text-red-500 text-xs font-medium">
            <X className="w-3.5 h-3.5" />
            <span>Try again</span>
          </div>
          {charFeedback.length > 0 && (
            <div className="flex items-center justify-center gap-0.5 text-lg">
              {charFeedback.map((cf, i) => (
                <span
                  key={i}
                  className={
                    cf.correct
                      ? "text-emerald-500"
                      : "text-red-500"
                  }
                >
                  {cf.char}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {feedback === "revealed" && (
        <div className="flex items-center gap-1 text-amber-500 text-xs font-medium">
          <Check className="w-3.5 h-3.5" />
          <span>Skipped</span>
        </div>
      )}

      {/* Action buttons — hidden once locked */}
      {!isLocked && (
        <div className="flex gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGiveUp}
            disabled={feedback !== "idle"}
            className="flex-1 text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
          >
            I give up
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCheck}
            disabled={feedback !== "idle" || !input.trim()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Check
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TypingDrillClient({
  pairs,
  initialCompletedIds,
}: TypingDrillClientProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(initialCompletedIds)
  );

  const totalSentences = pairs.reduce(
    (acc, p) => acc + (p.cantonese ? 1 : 0) + (p.mandarin ? 1 : 0),
    0
  );
  const completedCount = pairs.reduce(
    (acc, p) =>
      acc +
      (p.cantonese && completedIds.has(p.cantonese.id) ? 1 : 0) +
      (p.mandarin && completedIds.has(p.mandarin.id) ? 1 : 0),
    0
  );

  const handleComplete = useCallback((sentenceId: string) => {
    setCompletedIds((prev) => new Set(prev).add(sentenceId));
    fetch("/api/accelerator/typing/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentenceId }),
    }).catch(() => {});
  }, []);

  if (pairs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          No phrases available yet. Check back later!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Video section */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="aspect-video flex items-center justify-center bg-muted/30">
          <p className="text-muted-foreground text-sm">Demo video coming soon</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Progress</span>
          <span>
            {completedCount}/{totalSentences} completed
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{
              width: `${
                totalSentences > 0
                  ? (completedCount / totalSentences) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* Phrase pair cards */}
      <div className="space-y-4">
        {pairs.map((pair) => (
          <div
            key={pair.sortOrder}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* English header */}
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <p className="text-center font-semibold text-foreground">
                {pair.english}
              </p>
            </div>

            {/* Side-by-side columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {pair.cantonese && (
                <DrillSide
                  side={pair.cantonese}
                  language="cantonese"
                  isCompleted={completedIds.has(pair.cantonese.id)}
                  onComplete={handleComplete}
                />
              )}
              {pair.mandarin && (
                <DrillSide
                  side={pair.mandarin}
                  language="mandarin"
                  isCompleted={completedIds.has(pair.mandarin.id)}
                  onComplete={handleComplete}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* All done message */}
      {completedCount === totalSentences && totalSentences > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-2">
          <Check className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            All done!
          </h3>
          <p className="text-sm text-muted-foreground">
            You have completed all typing drills. Keep practicing to build
            speed!
          </p>
        </div>
      )}
    </div>
  );
}
