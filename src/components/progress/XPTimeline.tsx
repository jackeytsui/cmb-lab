"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ============================================================
// Types
// ============================================================

interface XPTimelineProps {
  dailyData: { date: string; xp: number }[];
  weeklyData: { date: string; xp: number }[];
  monthlyData: { date: string; xp: number }[];
}

type Period = "daily" | "weekly" | "monthly";

// ============================================================
// Chart Config
// ============================================================

const chartConfig = {
  xp: {
    label: "XP Earned",
    color: "#10b981", // emerald — matches existing activity rings
  },
} satisfies ChartConfig;

// ============================================================
// Tick Formatters
// ============================================================

/** Format date ticks depending on the active period. */
function formatTick(value: string, period: Period): string {
  // Weekly/monthly data comes pre-formatted from the server (e.g. "Jan 9", "Jan 2026")
  if (period === "weekly" || period === "monthly") {
    return value;
  }

  // Daily data arrives as "YYYY-MM-DD" — format to "MMM d"
  const d = new Date(value + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ============================================================
// Component
// ============================================================

export function XPTimeline({
  dailyData,
  weeklyData,
  monthlyData,
}: XPTimelineProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const dataMap: Record<Period, { date: string; xp: number }[]> = {
    daily: dailyData,
    weekly: weeklyData,
    monthly: monthlyData,
  };

  const activeData = dataMap[period];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">XP Timeline</h2>

      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as Period)}
        className="mb-4"
      >
        <TabsList className="bg-zinc-800/50">
          <TabsTrigger
            value="daily"
            className="data-[state=active]:bg-zinc-700"
          >
            Daily
          </TabsTrigger>
          <TabsTrigger
            value="weekly"
            className="data-[state=active]:bg-zinc-700"
          >
            Weekly
          </TabsTrigger>
          <TabsTrigger
            value="monthly"
            className="data-[state=active]:bg-zinc-700"
          >
            Monthly
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeData.length === 0 ? (
        <div className="flex items-center justify-center min-h-[250px] text-zinc-500">
          No XP data yet
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="min-h-[250px] w-full"
        >
          <AreaChart data={activeData} margin={{ left: 12, right: 12 }}>
            <defs>
              <linearGradient id="fillXP" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-xp)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-xp)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#27272a" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#a1a1aa" }}
              tickFormatter={(value: string) => formatTick(value, period)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#a1a1aa" }}
              width={40}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="xp"
              stroke="var(--color-xp)"
              fill="url(#fillXP)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
