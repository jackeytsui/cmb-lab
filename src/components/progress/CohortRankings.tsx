"use client";

// CohortRankings — Client Component
//
// Opt-in cohort rankings with a toggle switch and percentile bucket display.
// Toggle defaults to OFF. When ON, shows the student's relative position
// as percentile buckets ("Top 25%") across multiple dimensions.
// No individual names or exact ranks are ever displayed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { CohortRanking } from "@/lib/progress-dashboard";

// ============================================================
// Types
// ============================================================

interface CohortRankingsProps {
  initialEnabled: boolean;
  rankings: CohortRanking[] | null; // null = opted out or not enough students
}

// ============================================================
// Helpers
// ============================================================

/**
 * Map a percentile bucket label to a badge color scheme.
 * Top tiers get vibrant colors; lower tiers get neutral.
 */
function getBucketColor(bucket: string): {
  text: string;
  bg: string;
} {
  switch (bucket) {
    case "Top 5%":
    case "Top 10%":
      return { text: "text-emerald-400", bg: "bg-emerald-400/10" };
    case "Top 25%":
      return { text: "text-blue-400", bg: "bg-blue-400/10" };
    case "Top 50%":
      return { text: "text-yellow-400", bg: "bg-yellow-400/10" };
    case "Top 75%":
    case "Top 90%":
    case "Bottom half":
    default:
      return { text: "text-zinc-400", bg: "bg-zinc-700/50" };
  }
}

/**
 * Format a numeric value with the appropriate suffix for each dimension.
 */
function formatDimensionValue(dimension: string, value: number): string {
  switch (dimension) {
    case "totalXp":
      return `${value.toLocaleString()} XP`;
    case "longestStreak":
      return `${value} days`;
    case "avgPracticeScore":
      return `${value}%`;
    default:
      return value.toLocaleString();
  }
}

// ============================================================
// Dimension Row
// ============================================================

function DimensionRow({ ranking }: { ranking: CohortRanking }) {
  const bucketColor = getBucketColor(ranking.percentileBucket);

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/50 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-white">{ranking.label}</p>
        <p className="text-xs text-zinc-500">
          Your value: {formatDimensionValue(ranking.dimension, ranking.userValue)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bucketColor.text} ${bucketColor.bg}`}
        >
          {ranking.percentileBucket}
        </span>
        <p className="text-xs text-zinc-600">
          out of {ranking.totalStudents} active students
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function CohortRankings({ initialEnabled, rankings }: CohortRankingsProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    // Optimistic update
    const previousValue = enabled;
    setEnabled(checked);
    setSaving(true);

    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCohortRankings: checked }),
      });

      if (!response.ok) {
        throw new Error("Failed to update preference");
      }

      // When toggling ON, refresh the page to fetch rankings data server-side
      if (checked) {
        router.refresh();
      }
    } catch {
      // Revert on error
      setEnabled(previousValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader>
        <CardTitle className="text-lg text-white">Cohort Rankings</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              {enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={saving}
              aria-label="Toggle cohort rankings"
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          /* Toggle is OFF — prompt to opt in */
          <div className="flex flex-col items-center py-6 text-center">
            <Users className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400">
              See how you compare to other students
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              Turn on the toggle above to view your percentile rankings
            </p>
          </div>
        ) : rankings === null ? (
          /* Toggle is ON but not enough students */
          <div className="flex flex-col items-center py-6 text-center">
            <Users className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400">
              Cohort rankings require at least 5 active students.
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              Check back when more students have joined!
            </p>
          </div>
        ) : (
          /* Toggle is ON and rankings are available */
          <div className="flex flex-col gap-3">
            {rankings.map((ranking) => (
              <DimensionRow key={ranking.dimension} ranking={ranking} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
