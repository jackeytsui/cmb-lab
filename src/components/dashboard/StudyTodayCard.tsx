"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Clock3,
  Loader2,
  PencilLine,
  Target,
} from "lucide-react";

type Recommendation = {
  id: string;
  type: "srs" | "practice" | "tone" | "grammar";
  title: string;
  detail: string;
  priority: number;
  estimatedMinutes: number;
  href: string;
};

const MIN_GOAL = 10;
const MAX_GOAL = 180;
const PRESETS = [15, 30, 45, 60];

export function StudyTodayCard() {
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState(30);
  const [draftGoal, setDraftGoal] = useState("30");
  const [suggested, setSuggested] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      try {
        const response = await fetch("/api/study/today");
        if (!response.ok) throw new Error("Failed to load");
        const data = await response.json();
        if (cancelled) return;
        const nextGoal = data.dailyGoalMinutes ?? 30;
        setGoal(nextGoal);
        setDraftGoal(String(nextGoal));
        setSuggested(data.totalSuggestedMinutes ?? 0);
        setRecommendations(data.recommendations ?? []);
      } catch {
        // This panel is supplemental; keep the editable default available.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGoal(minutes: number) {
    if (!Number.isInteger(minutes) || minutes < MIN_GOAL || minutes > MAX_GOAL) {
      setSaveError(`Choose between ${MIN_GOAL} and ${MAX_GOAL} minutes.`);
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const response = await fetch("/api/study/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyMinutes: minutes }),
      });
      if (!response.ok) throw new Error("Failed to save your plan");
      setGoal(minutes);
      setDraftGoal(String(minutes));
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save your plan",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground sm:p-6">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building today&apos;s study plan…
        </span>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="study-today-heading"
      className="overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-card via-card to-emerald-500/[0.06]"
    >
      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="study-today-heading" className="mt-3 text-lg font-bold text-foreground">
            Study today
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Set a realistic daily target. You or your coach can adjust it anytime.
          </p>

          <div className="mt-5 rounded-xl border border-border bg-background/70 p-4">
            <label htmlFor="study-minutes" className="text-sm font-semibold text-foreground">
              Daily study goal
            </label>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="study-minutes"
                  type="number"
                  inputMode="numeric"
                  min={MIN_GOAL}
                  max={MAX_GOAL}
                  value={draftGoal}
                  onChange={(event) => {
                    setDraftGoal(event.target.value);
                    setSaved(false);
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-16 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  minutes
                </span>
              </div>
              <button
                type="button"
                aria-live="polite"
                disabled={saving}
                onClick={() => void saveGoal(Number(draftGoal))}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <PencilLine className="h-4 w-4" />
                )}
                {saved ? "Saved" : "Save"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  disabled={saving}
                  onClick={() => void saveGoal(minutes)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                    goal === minutes
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            {saveError ? (
              <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                {saveError}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/[0.08] px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Clock3 className="h-4 w-4 shrink-0" />
            Suggested activities total {suggested} minutes for your {goal}-minute goal.
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Recommended next</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on reviews and recent practice.
              </p>
            </div>
            <BrainCircuit className="h-5 w-5 text-primary/60" aria-hidden="true" />
          </div>

          <div className="mt-4 space-y-2.5">
            {recommendations.slice(0, 3).map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-start gap-3 rounded-xl border border-border bg-background/70 p-3.5 transition hover:border-primary/30 hover:bg-primary/[0.025]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {item.estimatedMinutes}m
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>

          {recommendations.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-background/70 p-5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                No urgent recommendations right now.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
