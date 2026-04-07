"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, Circle } from "lucide-react";

export function CompletionToggle({ completionKey }: { completionKey: string }) {
  const [completed, setCompleted] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch(`/api/accelerator/content-completion?key=${completionKey}`)
      .then((r) => r.json())
      .then((d) => setCompleted(!!d.completed))
      .catch(() => {});
  }, [completionKey]);

  const toggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/accelerator/content-completion", {
        method: completed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: completionKey }),
      });
      if (res.ok) setCompleted(!completed);
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  }, [completionKey, completed, toggling]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={toggling}
      className={`w-full rounded-xl border p-4 flex items-center justify-center gap-2.5 text-sm font-medium transition-all ${
        completed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-cyan-500/30"
      }`}
    >
      {toggling ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : completed ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <Circle className="w-4 h-4" />
      )}
      {completed ? "Completed" : "Mark as Complete"}
    </button>
  );
}
