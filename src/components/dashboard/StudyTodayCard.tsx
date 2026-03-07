"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Target } from "lucide-react";

type Recommendation = {
  id: string;
  type: "srs" | "practice" | "tone" | "grammar";
  title: string;
  detail: string;
  priority: number;
  estimatedMinutes: number;
  href: string;
};

export function StudyTodayCard() {
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState(30);
  const [suggested, setSuggested] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    fetch("/api/study/today")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        setGoal(data.dailyGoalMinutes ?? 30);
        setSuggested(data.totalSuggestedMinutes ?? 0);
        setRecommendations(data.recommendations ?? []);
      })
      .catch(() => {
        // Non-critical: card will show default empty state
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleGoalChange(minutes: number) {
    const res = await fetch("/api/study/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyMinutes: minutes }),
    });
    if (res.ok) setGoal(minutes);
  }

  if (loading) {
    return <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-zinc-400">Loading study plan...</div>;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">Study Today</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Suggested {suggested} min against your {goal} min goal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[15, 30, 60].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => handleGoalChange(minutes)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                goal === minutes
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {minutes}m
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {recommendations.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block rounded-md border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-zinc-700"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
                <Clock3 className="h-3.5 w-3.5" />
                {item.estimatedMinutes}m
              </div>
            </div>
          </Link>
        ))}
      </div>

      {recommendations.length === 0 && (
        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            No urgent recommendations right now.
          </div>
        </div>
      )}
    </div>
  );
}
