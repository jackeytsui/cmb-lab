"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { SetAggregate, HardestExercise } from "@/lib/coach-practice";

interface PracticeAggregateChartsProps {
  perSet: SetAggregate[];
  hardestExercises: HardestExercise[];
  loading: boolean;
}

const avgScoreConfig = {
  avgScore: {
    label: "Avg Score",
    color: "#10b981",
  },
} satisfies ChartConfig;

const incorrectRateConfig = {
  incorrectRate: {
    label: "Incorrect %",
    color: "#ef4444",
  },
} satisfies ChartConfig;

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

export function PracticeAggregateCharts({
  perSet,
  hardestExercises,
  loading,
}: PracticeAggregateChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <Skeleton className="h-4 w-48 bg-zinc-800 mb-4" />
          <Skeleton className="h-[250px] w-full bg-zinc-800 rounded" />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <Skeleton className="h-4 w-44 bg-zinc-800 mb-4" />
          <Skeleton className="h-[250px] w-full bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chart 1: Average Score per Practice Set */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">
          Average Score by Practice Set
        </h3>
        {perSet.length === 0 ? (
          <div className="flex items-center justify-center min-h-[250px] text-zinc-500 text-sm">
            No data available
          </div>
        ) : (
          <ChartContainer
            config={avgScoreConfig}
            className="min-h-[250px] w-full"
          >
            <BarChart
              data={perSet.map((s) => ({
                ...s,
                setTitle: truncate(s.setTitle, 15),
              }))}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} stroke="#27272a" />
              <XAxis
                dataKey="setTitle"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "#a1a1aa", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "#a1a1aa" }}
                width={35}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="avgScore"
                fill="var(--color-avgScore)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      {/* Chart 2: Hardest Exercises */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">
          Most Difficult Exercises
        </h3>
        {hardestExercises.length === 0 ? (
          <div className="flex items-center justify-center min-h-[250px] text-zinc-500 text-sm">
            Not enough data (min 3 attempts per exercise)
          </div>
        ) : (
          <ChartContainer
            config={incorrectRateConfig}
            className="min-h-[250px] w-full"
          >
            <BarChart
              data={hardestExercises.map((e) => ({
                ...e,
                exerciseLabel: e.exerciseType.replace(/_/g, " "),
              }))}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} stroke="#27272a" />
              <XAxis
                dataKey="exerciseLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "#a1a1aa", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "#a1a1aa" }}
                width={35}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as
                        | (HardestExercise & { exerciseLabel: string })
                        | undefined;
                      if (!item) return _label;
                      return `${item.exerciseLabel} (${item.practiceSetTitle}) - ${item.attemptCount} attempts`;
                    }}
                  />
                }
              />
              <Bar
                dataKey="incorrectRate"
                fill="var(--color-incorrectRate)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
