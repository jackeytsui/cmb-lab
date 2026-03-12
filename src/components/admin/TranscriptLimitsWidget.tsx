"use client";

import { useEffect, useState } from "react";

const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function TranscriptLimitsWidget() {
  const [limitCount, setLimitCount] = useState(5);
  const [period, setPeriod] = useState("weekly");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/usage-limits")
      .then((res) => res.json())
      .then((data) => {
        setLimitCount(data.limitCount ?? 5);
        setPeriod(data.period ?? "weekly");
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/usage-limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitCount, period }),
      });
      if (res.ok) {
        const data = await res.json();
        setLimitCount(data.limitCount);
        setPeriod(data.period);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // no-op
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        YouTube Transcript Usage Limits
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Control how many YouTube videos students can transcribe per period. Coaches and admins are unlimited.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            Max transcriptions
          </label>
          <input
            type="number"
            min={1}
            max={999}
            value={limitCount}
            onChange={(e) => setLimitCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="block h-9 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            Per
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="block h-9 w-28 rounded-md border border-border bg-background px-2 pr-8 text-sm text-foreground outline-none focus:border-primary"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Current setting: <span className="font-medium text-foreground">{limitCount}</span> transcriptions per{" "}
        <span className="font-medium text-foreground">{period === "daily" ? "day" : period === "weekly" ? "week" : "month"}</span> per student.
      </p>
    </div>
  );
}
