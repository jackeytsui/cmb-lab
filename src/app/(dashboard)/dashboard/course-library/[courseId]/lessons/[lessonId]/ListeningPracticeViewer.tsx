"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Check, X, Loader2, Eye, BookOpen, Headphones } from "lucide-react";
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

// Practice modes. Guided = the classic format (characters + English shown,
// transcribe the romanisation). Mastery = by ear alone: nothing is shown until
// the answer is checked, and either the romanisation OR the Chinese characters
// (Simplified or Traditional) count as correct. The choice is remembered per
// lesson per browser; switching affects only unanswered sentences.
type PracticeMode = "guided" | "mastery";

const MODE_STORAGE_PREFIX = "listening-practice-mode:";
const MODE_CHANGE_EVENT = "listening-practice-mode-change";

function readStoredMode(lessonId: string): PracticeMode {
  try {
    return window.localStorage.getItem(`${MODE_STORAGE_PREFIX}${lessonId}`) ===
      "mastery"
      ? "mastery"
      : "guided";
  } catch {
    return "guided";
  }
}

/**
 * The student's remembered mode for this lesson, backed by localStorage via
 * useSyncExternalStore — SSR renders "guided" and the stored choice applies
 * cleanly on hydration without a state-in-effect dance.
 */
function useRememberedMode(lessonId: string) {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(MODE_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(MODE_CHANGE_EVENT, onChange);
    };
  }, []);
  const mode = useSyncExternalStore(
    subscribe,
    () => readStoredMode(lessonId),
    () => "guided" as PracticeMode,
  );
  const changeMode = useCallback(
    (next: PracticeMode) => {
      try {
        window.localStorage.setItem(`${MODE_STORAGE_PREFIX}${lessonId}`, next);
      } catch {
        // storage unavailable — the choice just won't persist
      }
      window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
    },
    [lessonId],
  );
  return [mode, changeMode] as const;
}

const MODE_META: Record<
  PracticeMode,
  { label: string; Icon: typeof BookOpen }
> = {
  guided: { label: "Level 1 · Guided", Icon: BookOpen },
  mastery: { label: "Level 2 · Mastery", Icon: Headphones },
};

function modeInstructions(mode: PracticeMode, roman: string): string {
  return mode === "guided"
    ? `Read along as you listen — the Chinese and its meaning are shown. Type the ${roman} for what you hear. Tones and spaces don't matter.`
    : `By ear alone — nothing is shown until you check your answer. Type what you hear as ${roman} or as Chinese characters (Simplified and Traditional both count).`;
}

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

/** Romanisation-on-top reveal using the admin's (possibly edited) model answer. */
function RevealedSentence({
  chinese,
  pinyin,
  lang,
}: {
  chinese: string;
  pinyin: string;
  lang: "mandarin" | "cantonese";
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
          lang={lang}
        />
      ))}
    </span>
  );
}

export function ListeningPracticeViewer({
  lessonId,
  sentences,
  lang = "mandarin",
}: {
  lessonId: string;
  sentences: ListeningSentenceDto[];
  lang?: "mandarin" | "cantonese";
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

  // Mode is remembered per lesson per browser.
  const [mode, changeMode] = useRememberedMode(lessonId);

  const romanName = lang === "cantonese" ? "jyutping" : "pinyin";

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
          body: JSON.stringify({ sentenceId: id, mode, ...payload }),
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
      {/* Mode picker — the choice is remembered for this lesson. */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            Choose your level
          </p>
          <div className="flex rounded-lg border border-border bg-background p-1">
            {(Object.keys(MODE_META) as PracticeMode[]).map((m) => {
              const { label, Icon } = MODE_META[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeMode(m)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {modeInstructions(mode, romanName)}
        </p>
      </div>

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
              ttsLanguage={lang === "cantonese" ? "zh-HK" : "zh-CN"}
            />

            {/* Chinese: reveal romanisation-on-top once resolved. Before that,
                Guided shows the plain characters (+ English beneath) while
                Mastery shows nothing — by ear alone until checked. */}
            <div className="rounded-md bg-background px-3 py-3">
              {showReveal ? (
                <RevealedSentence
                  chinese={sentence.chinese}
                  pinyin={st.revealed as string}
                  lang={lang}
                />
              ) : mode === "mastery" ? (
                <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
                  <Headphones className="h-4 w-4 shrink-0" />
                  Listen closely — the sentence is revealed after you answer.
                </p>
              ) : (
                <span
                  className="font-medium text-foreground"
                  style={{ fontSize: `${ASSIGNMENT_CHAR_SIZE}px`, lineHeight: 1.4 }}
                >
                  {sentence.chinese}
                </span>
              )}
              {sentence.english && (mode === "guided" || resolved) && (
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
                  placeholder={
                    mode === "mastery"
                      ? `Type the ${romanName} or the Chinese characters`
                      : `Type the ${romanName} (tones and spaces don't matter)`
                  }
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
                    <Eye className="h-4 w-4" />
                    Reveal answer
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
