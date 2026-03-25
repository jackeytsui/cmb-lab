"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Check,
  X,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sentence {
  id: string;
  language: "mandarin" | "cantonese";
  chineseText: string;
  englishText: string;
  romanisation: string;
  sortOrder: number;
}

interface TypingDrillClientProps {
  sentences: Sentence[];
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
// Component
// ---------------------------------------------------------------------------

export default function TypingDrillClient({
  sentences,
  initialCompletedIds,
}: TypingDrillClientProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(initialCompletedIds)
  );
  const [activeLanguage, setActiveLanguage] = useState<
    "mandarin" | "cantonese" | null
  >(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "correct" | "wrong"
  >("idle");
  const [charFeedback, setCharFeedback] = useState<
    Array<{ char: string; correct: boolean }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Group sentences by language
  const mandarinSentences = useMemo(
    () => sentences.filter((s) => s.language === "mandarin"),
    [sentences]
  );
  const cantoneseSentences = useMemo(
    () => sentences.filter((s) => s.language === "cantonese"),
    [sentences]
  );

  // Active language sentences
  const activeSentences = useMemo(() => {
    if (!activeLanguage) return [];
    return activeLanguage === "mandarin" ? mandarinSentences : cantoneseSentences;
  }, [activeLanguage, mandarinSentences, cantoneseSentences]);

  const currentSentence = activeSentences[currentIndex] ?? null;

  // Completion counts
  const mandarinCompleted = useMemo(
    () => mandarinSentences.filter((s) => completedIds.has(s.id)).length,
    [mandarinSentences, completedIds]
  );
  const cantoneseCompleted = useMemo(
    () => cantoneseSentences.filter((s) => completedIds.has(s.id)).length,
    [cantoneseSentences, completedIds]
  );

  // Focus input when entering drill or advancing
  useEffect(() => {
    if (activeLanguage && feedbackState === "idle") {
      inputRef.current?.focus();
    }
  }, [activeLanguage, currentIndex, feedbackState]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Drill logic
  // ---------------------------------------------------------------------------

  function startDrill(language: "mandarin" | "cantonese") {
    const langSentences =
      language === "mandarin" ? mandarinSentences : cantoneseSentences;
    // Start at first uncompleted sentence
    const firstUncompleted = langSentences.findIndex(
      (s) => !completedIds.has(s.id)
    );
    setActiveLanguage(language);
    setCurrentIndex(firstUncompleted >= 0 ? firstUncompleted : 0);
    setInputValue("");
    setFeedbackState("idle");
    setCharFeedback([]);
  }

  function backToSections() {
    setActiveLanguage(null);
    setCurrentIndex(0);
    setInputValue("");
    setFeedbackState("idle");
    setCharFeedback([]);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }

  const handleSubmit = useCallback(() => {
    if (!currentSentence || feedbackState !== "idle") return;
    const input = inputValue.trim();
    if (!input) return;

    const isCorrect =
      normalizeForComparison(input) ===
      normalizeForComparison(currentSentence.chineseText);

    if (isCorrect) {
      setFeedbackState("correct");
      setCharFeedback([]);

      // Track completion optimistically
      setCompletedIds((prev) => new Set(prev).add(currentSentence.id));

      // POST progress to API (fire-and-forget)
      fetch("/api/accelerator/typing/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentenceId: currentSentence.id }),
      }).catch(() => {
        // Silently fail — local state is already updated
      });

      // Auto-advance after 800ms
      advanceTimerRef.current = setTimeout(() => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < activeSentences.length) {
          setCurrentIndex(nextIndex);
          setInputValue("");
          setFeedbackState("idle");
        } else {
          // All done in this section
          backToSections();
        }
      }, 800);
    } else {
      setFeedbackState("wrong");
      setCharFeedback(getCharFeedback(input, currentSentence.chineseText));

      // Clear input and reset after 1.5s so student can retry
      setTimeout(() => {
        setInputValue("");
        setFeedbackState("idle");
        setCharFeedback([]);
        inputRef.current?.focus();
      }, 1500);
    }
  }, [currentSentence, feedbackState, inputValue, currentIndex, activeSentences.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // Section Selection View
  // ---------------------------------------------------------------------------

  if (!activeLanguage) {
    return (
      <div className="space-y-6">
        {/* Demo video placeholder */}
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">Demo video coming soon</p>
        </div>

        {/* Section cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Mandarin section */}
          <button
            onClick={() => startDrill("mandarin")}
            className="group rounded-lg border border-border bg-card p-6 text-left hover:border-blue-500/50 hover:bg-accent transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Mandarin</h3>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {mandarinCompleted}/{mandarinSentences.length} completed
            </p>
            {/* Progress bar */}
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${
                    mandarinSentences.length > 0
                      ? (mandarinCompleted / mandarinSentences.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </button>

          {/* Cantonese section */}
          <button
            onClick={() => startDrill("cantonese")}
            className="group rounded-lg border border-border bg-card p-6 text-left hover:border-amber-500/50 hover:bg-accent transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Cantonese
              </h3>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-amber-500 transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {cantoneseCompleted}/{cantoneseSentences.length} completed
            </p>
            {/* Progress bar */}
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{
                  width: `${
                    cantoneseSentences.length > 0
                      ? (cantoneseCompleted / cantoneseSentences.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Drill View
  // ---------------------------------------------------------------------------

  const completedInSection = activeSentences.filter((s) =>
    completedIds.has(s.id)
  ).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top bar: back button + progress */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={backToSections}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to sections
        </Button>
        <span className="text-sm text-muted-foreground">
          {completedInSection}/{activeSentences.length} completed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            activeLanguage === "mandarin" ? "bg-blue-500" : "bg-amber-500"
          }`}
          style={{
            width: `${
              activeSentences.length > 0
                ? (completedInSection / activeSentences.length) * 100
                : 0
            }%`,
          }}
        />
      </div>

      {/* Sentence card */}
      {currentSentence ? (
        <div
          className={`rounded-xl border p-8 space-y-6 transition-colors ${
            feedbackState === "correct"
              ? "border-emerald-500/50 bg-emerald-500/10"
              : feedbackState === "wrong"
                ? "border-red-500/50 bg-red-500/10"
                : "border-border bg-card"
          }`}
        >
          {/* Prompt */}
          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-foreground">
              {currentSentence.englishText}
            </p>
            <p className="text-sm text-muted-foreground">
              {currentSentence.romanisation}
            </p>
          </div>

          {/* Input */}
          <div className="space-y-3">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type the Chinese characters..."
              className={`text-center text-2xl h-14 font-medium transition-colors ${
                feedbackState === "correct"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : feedbackState === "wrong"
                    ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-300"
                    : ""
              }`}
              disabled={feedbackState !== "idle"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            {/* Feedback icons */}
            {feedbackState === "correct" && (
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 animate-pulse">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Correct!</span>
              </div>
            )}

            {feedbackState === "wrong" && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                  <X className="w-5 h-5" />
                  <span className="text-sm font-medium">Try again</span>
                </div>

                {/* Character-by-character feedback */}
                {charFeedback.length > 0 && (
                  <div className="flex items-center justify-center gap-0.5 text-lg">
                    {charFeedback.map((cf, i) => (
                      <span
                        key={i}
                        className={
                          cf.correct
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }
                      >
                        {cf.char}
                      </span>
                    ))}
                  </div>
                )}

                {/* Show correct answer */}
                <p className="text-center text-emerald-600 dark:text-emerald-400 text-lg font-medium">
                  {currentSentence.chineseText}
                </p>
              </div>
            )}
          </div>

          {/* Submit button */}
          {feedbackState === "idle" && (
            <div className="flex justify-center">
              <Button
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                size="lg"
              >
                Check Answer
              </Button>
            </div>
          )}

          {/* Already completed badge */}
          {completedIds.has(currentSentence.id) && feedbackState === "idle" && (
            <p className="text-center text-xs text-muted-foreground">
              Already completed — practicing again
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">
            All done!
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            You have completed all{" "}
            {activeLanguage === "mandarin" ? "Mandarin" : "Cantonese"} typing
            drills.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={backToSections}
          >
            Back to sections
          </Button>
        </div>
      )}
    </div>
  );
}
