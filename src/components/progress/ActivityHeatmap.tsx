"use client";

import { ActivityCalendar } from "react-activity-calendar";

// ============================================================
// Types
// ============================================================

export interface HeatmapDay {
  date: string; // "YYYY-MM-DD"
  count: number; // total XP
  level: 0 | 1 | 2 | 3 | 4;
}

interface ActivityHeatmapProps {
  data: HeatmapDay[];
}

// ============================================================
// Theme
// ============================================================

/** Emerald color scale from zinc-800 (no activity) to emerald-400 (very active) */
const EMERALD_THEME = {
  dark: ["#27272a", "#065f46", "#047857", "#059669", "#10b981"],
};

// ============================================================
// Component
// ============================================================

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Activity</h2>

      <ActivityCalendar
        data={data}
        maxLevel={4}
        colorScheme="dark"
        theme={EMERALD_THEME}
        labels={{
          totalCount: "{{count}} XP earned in the last year",
        }}
        fontSize={12}
        blockSize={12}
        blockMargin={3}
        showTotalCount={true}
        showColorLegend={true}
      />
    </div>
  );
}
