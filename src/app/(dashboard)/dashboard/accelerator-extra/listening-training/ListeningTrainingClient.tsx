"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTS } from "@/hooks/useTTS";
import { pinyin } from "pinyin-pro";
import { getToneColorClass, extractToneFromPinyin } from "@/lib/tone-colors";

type Question = {
  id: string;
  sortOrder: number;
  chineseText: string;
  englishText: string;
  correctPinyin: string;
  wrongPinyin1: string;
  wrongPinyin2: string;
  wrongPinyin3: string;
};

/**
 * Randomize option positions per question.
 * Uses sortOrder to deterministically place the correct answer at different positions
 * so it's not always A. Stable across re-renders.
 */
function shuffleOptions(question: Question): string[] {
  const wrongs = [question.wrongPinyin1, question.wrongPinyin2, question.wrongPinyin3];
  // Place correct answer at position based on sortOrder (cycles through 0-3)
  const correctPos = question.sortOrder % 4;
  const result: string[] = [];
  let wi = 0;
  for (let i = 0; i < 4; i++) {
    if (i === correctPos) {
      result.push(question.correctPinyin);
    } else {
      result.push(wrongs[wi++]);
    }
  }
  return result;
}

function RevealSection({
  chineseText,
  englishText,
}: {
  chineseText: string;
  englishText: string;
}) {
  const chars = useMemo(() => {
    const charArray = [...chineseText];
    const pinyinArray = pinyin(chineseText, {
      toneType: "symbol",
      type: "array",
    });
    const toneNumbers = pinyin(chineseText, {
      pattern: "num",
      type: "array",
    }).map(Number);

    return charArray.map((char, i) => {
      const isChinese = /\p{Script=Han}/u.test(char);
      const isPunctuation = /[。，？！、；：""''（）【】《》…—·\s]/.test(char);
      const py = pinyinArray[i] ?? "";
      const tone = toneNumbers[i] ?? 0;
      const colorClass = isChinese ? getToneColorClass(tone, "mandarin") : "";
      return { char, py: isChinese ? py : "", colorClass, isPunctuation };
    });
  }, [chineseText]);

  return (
    <div className="pl-7 pt-2 space-y-2">
      {/* Characters with pinyin above */}
      <div className="flex flex-wrap items-end">
        {chars.map((c, i) =>
          c.isPunctuation ? (
            <span key={i} className="text-lg text-muted-foreground/50 self-end leading-none mb-[1px]">
              {c.char}
            </span>
          ) : (
            <span key={i} className="inline-flex flex-col items-center px-[1px]">
              {c.py && (
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {c.py}
                </span>
              )}
              <span className={cn("text-lg font-medium", c.colorClass)}>
                {c.char}
              </span>
            </span>
          ),
        )}
      </div>
      {/* English translation */}
      <p className="text-sm text-muted-foreground italic">{englishText}</p>
    </div>
  );
}

function QuestionCard({
  question,
  isCompleted,
  onComplete,
}: {
  question: Question;
  isCompleted: boolean;
  onComplete: (questionId: string) => void;
}) {
  const { speak, stop, isLoading: ttsLoading, isPlaying: ttsPlaying } = useTTS();
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState(isCompleted);
  const [rate, setRate] = useState<"x-slow" | "medium" | "fast">("medium");
  const [replayCount, setReplayCount] = useState(1);
  const replayAbortRef = useRef(false);

  const options = useMemo(() => shuffleOptions(question), [question]);

  const handlePlay = useCallback(async () => {
    if (ttsPlaying) {
      stop();
      replayAbortRef.current = true;
      return;
    }
    replayAbortRef.current = false;
    for (let i = 0; i < replayCount; i++) {
      if (replayAbortRef.current) break;
      await speak(question.chineseText, { language: "zh-CN", rate });
      if (i < replayCount - 1 && !replayAbortRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }, [speak, stop, ttsPlaying, question.chineseText, rate, replayCount]);

  const handlePick = useCallback(
    (option: string) => {
      if (solved) return;
      if (option === question.correctPinyin) {
        setSolved(true);
        onComplete(question.id);
      } else {
        setWrongPicks((prev) => new Set(prev).add(option));
      }
    },
    [solved, question.correctPinyin, question.id, onComplete],
  );

  const labels = ["A", "B", "C", "D"];

  return (
    <div
      className={cn(
        "rounded-xl border p-5 space-y-4 transition-colors",
        solved
          ? "border-emerald-500/30 bg-emerald-500/[0.03]"
          : "border-border bg-card",
      )}
    >
      {/* Question: number + listen button + English translation */}
      <div className="flex items-start gap-3">
        <span className="text-sm font-bold text-muted-foreground/60 tabular-nums mt-1">
          {question.sortOrder}.
        </span>
        <div className="flex-1 space-y-2">
          {/* English translation */}
          <p className="text-base font-medium text-foreground italic">
            {question.englishText}
          </p>

          {/* Audio controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Play / Stop button */}
            <button
              type="button"
              onClick={handlePlay}
              disabled={ttsLoading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
                ttsPlaying
                  ? "bg-cyan-500/15 text-cyan-500 border-cyan-500/30"
                  : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border-border",
              )}
            >
              {ttsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : ttsPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {ttsLoading ? "Loading..." : ttsPlaying ? "Stop" : "Listen"}
            </button>

            {/* Speed selector */}
            <div className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground font-medium">Speed</span>
              <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
                {(["x-slow", "medium", "fast"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRate(r)}
                    className={cn(
                      "px-2.5 py-1 font-medium transition-colors",
                      rate === r
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {r === "x-slow" ? "0.5x" : r === "medium" ? "1x" : "1.5x"}
                  </button>
                ))}
              </div>
            </div>

            {/* Replay count */}
            <div className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground font-medium">Repeat</span>
              <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
                {[1, 2, 3].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setReplayCount(c)}
                    className={cn(
                      "px-2 py-1 font-medium transition-colors",
                      replayCount === c
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {c}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Completed badge */}
        {solved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
        {options.map((option, idx) => {
          const isCorrect = option === question.correctPinyin;
          const isWrong = wrongPicks.has(option);
          const showCorrect = solved && isCorrect;
          const disabled = solved || isWrong;

          return (
            <button
              key={option}
              type="button"
              onClick={() => handlePick(option)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-left transition-all",
                showCorrect
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : isWrong
                    ? "border-red-500/50 bg-red-500/5 text-red-400/60 cursor-not-allowed"
                    : disabled
                      ? "border-border bg-muted/50 text-muted-foreground cursor-not-allowed"
                      : "border-border bg-card hover:border-cyan-500/30 hover:bg-accent/50 text-foreground cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
                  showCorrect
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : isWrong
                      ? "bg-red-500/20 text-red-400/60"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {showCorrect ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isWrong ? (
                  <X className="w-3.5 h-3.5" />
                ) : (
                  labels[idx]
                )}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Reveal Chinese characters with pinyin + tone colors + English */}
      {solved && (
        <RevealSection
          chineseText={question.chineseText}
          englishText={question.englishText}
        />
      )}
    </div>
  );
}

export function ListeningTrainingClient() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accelerator-extra/listening-training")
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data.questions ?? []);
        setCompletedIds(new Set(data.completedIds ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleComplete = useCallback((questionId: string) => {
    setCompletedIds((prev) => new Set(prev).add(questionId));
    fetch("/api/accelerator-extra/listening-training/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedCount = completedIds.size;
  const totalCount = questions.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completedCount}/{totalCount} completed</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* No questions */}
      {totalCount === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Listening training questions will be available soon.
          </p>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            isCompleted={completedIds.has(q.id)}
            onComplete={handleComplete}
          />
        ))}
      </div>

      {/* All done */}
      {completedCount === totalCount && totalCount > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-2">
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            All questions completed!
          </p>
          <p className="text-sm text-muted-foreground">
            Great job on your listening comprehension training.
          </p>
        </div>
      )}
    </div>
  );
}
