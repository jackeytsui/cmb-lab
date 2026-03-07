"use client";

import { Users, GraduationCap, Target, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PracticeAggregateCardsProps {
  totalAttempts: number;
  totalStudents: number;
  overallAvgScore: number;
  overallCompletionRate: number;
  loading: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

const cards = [
  {
    key: "totalAttempts" as const,
    label: "Total Attempts",
    icon: Users,
    suffix: "",
    colorFn: () => "text-white",
  },
  {
    key: "totalStudents" as const,
    label: "Unique Students",
    icon: GraduationCap,
    suffix: "",
    colorFn: () => "text-white",
  },
  {
    key: "overallAvgScore" as const,
    label: "Avg Score",
    icon: Target,
    suffix: "%",
    colorFn: scoreColor,
  },
  {
    key: "overallCompletionRate" as const,
    label: "Completion Rate",
    icon: CheckCircle2,
    suffix: "%",
    colorFn: () => "text-white",
  },
] as const;

export function PracticeAggregateCards({
  totalAttempts,
  totalStudents,
  overallAvgScore,
  overallCompletionRate,
  loading,
}: PracticeAggregateCardsProps) {
  const values = {
    totalAttempts,
    totalStudents,
    overallAvgScore,
    overallCompletionRate,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = values[card.key];
        return (
          <Card key={card.key} className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-zinc-800 p-2">
                  <Icon className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    {card.label}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-16 bg-zinc-800 mt-1" />
                  ) : (
                    <p
                      className={`text-2xl font-bold ${card.colorFn(value)}`}
                    >
                      {value}
                      {card.suffix}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
