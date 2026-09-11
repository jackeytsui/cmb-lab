"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, HeartHandshake, Loader2, Star, X } from "lucide-react";
import { coachingFeedbackSessionLabel } from "@/lib/coaching-feedback-prompt";
import { cn } from "@/lib/utils";

type FeedbackPrompt = {
  sessionId: string;
  title: string;
  type: "one_on_one" | "inner_circle";
  coachName: string | null;
  occurredAt: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const RATING_LABELS = [
  "Not useful",
  "Needs improvement",
  "Okay",
  "Helpful",
  "Excellent",
] as const;

export function SessionFeedbackPrompt() {
  const [prompt, setPrompt] = useState<FeedbackPrompt | null>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const shownRecordedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/coaching/rating-prompt", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { prompt?: FeedbackPrompt | null } | null) => {
        if (controller.signal.aborted || !data?.prompt) return;
        setPrompt(data.prompt);

        if (!shownRecordedRef.current) {
          shownRecordedRef.current = true;
          void fetch("/api/coaching/rating-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "shown",
              sessionId: data.prompt.sessionId,
            }),
            keepalive: true,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          // Feedback collection is supplemental; never disrupt the dashboard.
          setPrompt(null);
        }
      });

    return () => controller.abort();
  }, []);

  if (!prompt) return null;

  const visibleRating = hoveredRating || rating;
  const sessionLabel = coachingFeedbackSessionLabel(prompt.type);
  const dateLabel = new Date(prompt.occurredAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  async function submitFeedback() {
    if (!prompt || rating < 1 || saveState === "saving") return;
    setSaveState("saving");
    setError(null);

    try {
      const response = await fetch(
        `/api/coaching/sessions/${prompt.sessionId}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating,
            comment: comment.trim() || undefined,
          }),
        },
      );
      if (!response.ok && response.status !== 409) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Could not save your feedback");
      }
      setSaveState("saved");
    } catch (reason) {
      setSaveState("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save your feedback. Please try again.",
      );
    }
  }

  function dismiss() {
    setPrompt(null);
  }

  function skipSession() {
    if (!prompt) return;
    const sessionId = prompt.sessionId;
    void fetch("/api/coaching/rating-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip", sessionId }),
      keepalive: true,
    });
    setPrompt(null);
  }

  if (saveState === "saved") {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/60">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Thank you for helping us improve coaching.</p>
            <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
              Your {rating}-star rating was sent to the CMB team.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close feedback confirmation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="session-feedback-heading"
      data-testid="session-feedback-prompt"
      className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-amber-50/70 p-4 shadow-sm dark:border-indigo-800 dark:from-indigo-950/35 dark:via-card dark:to-amber-950/20 sm:p-5"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#3545aa] to-[#f2b705]" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Maybe next time"
        className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background/80 hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex flex-col gap-4 pr-8 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
            <HeartHandshake className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
                10-second check-in
              </p>
              <span className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {sessionLabel} · {dateLabel}
              </span>
            </div>
            <h2
              id="session-feedback-heading"
              className="mt-1 text-base font-semibold text-foreground sm:text-lg"
            >
              How was your recent {sessionLabel} session?
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              One quick rating helps us make your next session more useful.
              {prompt.coachName ? ` Shared with ${prompt.coachName} and the CMB team.` : " Shared with the CMB team."}
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:w-[25rem]">
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={`Rate ${prompt.title}`}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                aria-label={`${star} out of 5 — ${RATING_LABELS[star - 1]}`}
                aria-pressed={rating === star}
                className="inline-flex size-10 items-center justify-center rounded-lg transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-amber-950/50"
              >
                <Star
                  className={cn(
                    "h-6 w-6 transition-colors",
                    visibleRating >= star
                      ? "fill-amber-400 text-amber-500"
                      : "text-muted-foreground/50",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
            <span className="ml-2 min-w-24 text-xs font-medium text-muted-foreground">
              {rating > 0 ? RATING_LABELS[rating - 1] : "Choose a rating"}
            </span>
          </div>

          {rating > 0 && (
            <div className="mt-3 space-y-2">
              <label htmlFor="session-feedback-comment" className="sr-only">
                Optional feedback about this coaching session
              </label>
              <textarea
                id="session-feedback-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={2_000}
                rows={2}
                placeholder="Optional: what helped, or what could be better?"
                className="w-full resize-none rounded-xl border border-input bg-background/90 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={skipSession}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  I didn&apos;t attend this session
                </button>
                <button
                  type="button"
                  onClick={submitFeedback}
                  disabled={saveState === "saving"}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#2e3a97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#24307f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveState === "saving" && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {saveState === "saving" ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </div>
          )}

          {rating === 0 && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={skipSession}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                I didn&apos;t attend this session
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
