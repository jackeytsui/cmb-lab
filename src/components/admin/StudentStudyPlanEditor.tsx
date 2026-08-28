"use client";

import { useState } from "react";
import { Check, Clock3, Loader2, Target } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [15, 30, 45, 60];

export function StudentStudyPlanEditor({
  studentId,
  studentName,
  initialDailyMinutes,
}: {
  studentId: string;
  studentName: string;
  initialDailyMinutes: number;
}) {
  const [savedMinutes, setSavedMinutes] = useState(initialDailyMinutes);
  const [draftMinutes, setDraftMinutes] = useState(String(initialDailyMinutes));
  const [saving, setSaving] = useState(false);

  async function save(minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) {
      toast.error("Choose a daily goal between 10 and 180 minutes.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/students/${studentId}/study-preferences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyMinutes: minutes }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update study plan");
      }
      setSavedMinutes(minutes);
      setDraftMinutes(String(minutes));
      toast.success(`${studentName}'s daily study goal is now ${minutes} minutes.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update study plan",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Target className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">Daily study goal</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Set the time shown in {studentName}&apos;s Study Today panel. The student can also adjust this goal.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <Clock3 className="h-3.5 w-3.5" />
          {savedMinutes} minutes/day
        </span>
      </div>

      <div className="mt-5 flex max-w-md items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            aria-label="Daily study minutes"
            type="number"
            inputMode="numeric"
            min={10}
            max={180}
            value={draftMinutes}
            onChange={(event) => setDraftMinutes(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-16 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            minutes
          </span>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(Number(draftMinutes))}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save plan
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={saving}
            onClick={() => void save(minutes)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
              savedMinutes === minutes
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {minutes} min
          </button>
        ))}
      </div>
    </div>
  );
}
