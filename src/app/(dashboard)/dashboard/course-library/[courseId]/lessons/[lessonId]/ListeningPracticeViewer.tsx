"use client";

import { useMemo, useState } from "react";
import { Check, X, Loader2, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnnotatedChar } from "@/components/assignments/AnnotatedChar";
import {
  annotateFromModelAnswer,
  ASSIGNMENT_CHAR_SIZE,
  ASSIGNMENT_ENGLISH_SIZE,
} from "@/lib/mandarin-annotate";
import { ListeningAudioPlayer } from "./ListeningAudioPlayer";

// ---------------------------------------------------------------------------
// Student-facing Listening Practice: listen, type the pinyin, auto-check.
// Model answers never ship to the client — the reveal pinyin is returned by the
// server only once a sentence is correct or given up.
// ---------------------------------------------------------------------------

type Status = "unanswered" | "incorrect" | "correct" | "gaveup";

export interface ListeningSentenceDto {
  id: string;
  chinese: string;
  /** English translation, shown beneath the Chinese before and after answering. */
  english: string;
  hasOverride: boolean;
  /** Prior status restored from saved progress. */
  initialStatus: Status;
  /** Revealed model pinyin for already-resolved sentences (else null). */
  revealedPinyin: string | null;
}

interface SentenceState {
  status: Status;
  input: string;
  revealed: string | null;
  checking: boolean;
  error: string | null;
}

/** Pinyin-on-top reveal using the admin's (possibly edited) model answer. */
function RevealedSentence({
  chinese,
  pinyin,
}: {
  chinese: string;
  pinyin: string;
}) {
  const annotations = annotateFromModelAnswer(chinese, pinyin);
  return (
    <span
      className="inline-flex flex-wrap items-end gap-y-1.5"
      style={{ lineHeight: 1.15 }}
    >
      {annotations.map((ann) => (
        <AnnotatedChar
          key={ann.offset}
          ann={ann}
          fontSize={ASSIGNMENT_CHAR_SIZE}
        />
      ))}
    </span>
  );
}

export function ListeningPracticeViewer({
  lessonId,
  sentences,
}: {
  lessonId: string;
  sentences: ListeningSentenceDto[];
}) {
  const [state, setState] = useState<Record<string, SentenceState>>(() => {
    const initial: Record<string, SentenceState> = {};
    for (const s of sentences) {
      initial[s.id] = {
        status: s.initialStatus,
        input: "",
        revealed: s.revealedPinyin,
        checking: false,
        error: null,
      };
    }
    return initial;
  });

  const patch = (id: string, next: Partial<SentenceState>) =>
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  const summary = useMemo(() => {
    const total = sentences.length;
    let correct = 0;
    let resolved = 0;
    for (const s of sentences) {
      const st = state[s.id]?.status;
      if (st === "correct") {
        correct += 1;
        resolved += 1;
      } else if (st === "gaveup") {
        resolved += 1;
      }
    }
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, resolved, score, allResolved: resolved >= total };
  }, [sentences, state]);

  const send = async (
    id: string,
    payload: { answer?: string; giveUp?: boolean },
  ) => {
    patch(id, { checking: true, error: null });
    try {
      const res = await fetch(
        `/api/course-library/lessons/${lessonId}/listening-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentenceId: id, ...payload }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        patch(id, { checking: false, error: data.error || "Something went wrong" });
        return;
      }
      patch(id, {
        checking: false,
        status: data.status as Status,
        revealed: data.pinyin ?? null,
      });
    } catch {
      patch(id, { checking: false, error: "Network error" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Progress / final percentage */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {summary.allResolved ? "Your score" : "Progress"}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.resolved} of {summary.total} sentences done ·{" "}
            {summary.correct} correct
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-2xl font-bold",
              summary.allResolved ? "text-primary" : "text-muted-foreground",
            )}
          >
            {summary.score}%
          </p>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${
                  summary.total > 0
                    ? Math.round((summary.resolved / summary.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {sentences.map((sentence, idx) => {
        const st = state[sentence.id];
        const resolved = st.status === "correct" || st.status === "gaveup";
        const showReveal = resolved && st.revealed;

        return (
          <div
            key={sentence.id}
            className={cn(
              "overflow-hidden rounded-lg border bg-card p-4 space-y-3",
              st.status === "correct"
                ? "border-emerald-500/50"
                : st.status === "gaveup"
                  ? "border-red-500/50"
                  : "border-border",
            )}
          >
            {resolved ? (
              // Full-width success / revealed banner across the top of the card.
              <div
                className={cn(
                  "-mx-4 -mt-4 flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white",
                  st.status === "correct" ? "bg-emerald-600" : "bg-red-600",
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
                  {idx + 1}
                </span>
                {st.status === "correct" ? (
                  <>
                    <Check className="h-4 w-4" />
                    Correct!
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Answer revealed
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
              </div>
            )}

            <ListeningAudioPlayer
              lessonId={lessonId}
              sentenceId={sentence.id}
              chinese={sentence.chinese}
              hasOverride={sentence.hasOverride}
            />

            {/* Chinese: reveal pinyin-on-top once resolved, else plain chars.
                English translation is shown beneath in both states. */}
            <div className="rounded-md bg-background px-3 py-3">
              {showReveal ? (
                <RevealedSentence
                  chinese={sentence.chinese}
                  pinyin={st.revealed as string}
                />
              ) : (
                <span
                  className="font-medium text-foreground"
                  style={{ fontSize: `${ASSIGNMENT_CHAR_SIZE}px`, lineHeight: 1.4 }}
                >
                  {sentence.chinese}
                </span>
              )}
              {sentence.english && (
                <p
                  className="mt-1.5 text-muted-foreground"
                  style={{ fontSize: `${ASSIGNMENT_ENGLISH_SIZE}px` }}
                >
                  {sentence.english}
                </p>
              )}
            </div>

            {!resolved && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={st.input}
                  onChange={(e) =>
                    patch(sentence.id, { input: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && st.input.trim() && !st.checking) {
                      send(sentence.id, { answer: st.input });
                    }
                  }}
                  placeholder="Type the pinyin (tones and spaces don't matter)"
                  disabled={st.checking}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                {st.status === "incorrect" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Not quite — give it another try. Adjust the speed or replay
                    the audio if you need to.
                  </p>
                )}
                {st.error && (
                  <p className="text-xs text-red-500">{st.error}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => send(sentence.id, { answer: st.input })}
                    disabled={st.checking || !st.input.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {st.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => send(sentence.id, { giveUp: true })}
                    disabled={st.checking}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Flag className="h-4 w-4" />
                    Give up
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
