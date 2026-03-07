// PersonalBests — Server Component
//
// Displays a grid of personal best stat cards showing the student's
// top records across all activity dimensions. No "use client" — pure
// server component that receives data as props.

import {
  Flame,
  Zap,
  Target,
  BookOpen,
  Trophy,
  MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import type { PersonalBests as PersonalBestsData } from "@/lib/progress-dashboard";

// ============================================================
// Types
// ============================================================

interface PersonalBestsProps {
  data: PersonalBestsData;
}

interface StatCardConfig {
  icon: LucideIcon;
  value: string;
  label: string;
  subtitle?: string | null;
  color: string; // Tailwind text color class
  iconBg: string; // Tailwind bg color class for icon backdrop
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({ icon: Icon, value, label, subtitle, color, iconBg }: StatCardConfig) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4 flex flex-col items-center text-center gap-2">
      <div className={`rounded-full p-2 ${iconBg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
      {subtitle && (
        <p className="text-xs text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function PersonalBests({ data }: PersonalBestsProps) {
  const stats: StatCardConfig[] = [
    {
      icon: Flame,
      value: `${data.longestStreak} days`,
      label: "Longest Streak",
      color: "text-orange-400",
      iconBg: "bg-orange-400/10",
    },
    {
      icon: Zap,
      value: `${data.highestDailyXP.toLocaleString()} XP`,
      label: "Highest Daily XP",
      subtitle: data.highestDailyXPDate
        ? format(new Date(data.highestDailyXPDate + "T00:00:00"), "MMM d, yyyy")
        : null,
      color: "text-yellow-400",
      iconBg: "bg-yellow-400/10",
    },
    {
      icon: Target,
      value: data.bestPracticeScore !== null ? `${data.bestPracticeScore}%` : "\u2014",
      label: "Best Practice Score",
      color: "text-emerald-400",
      iconBg: "bg-emerald-400/10",
    },
    {
      icon: BookOpen,
      value: data.totalLessonsCompleted.toLocaleString(),
      label: "Total Lessons",
      color: "text-blue-400",
      iconBg: "bg-blue-400/10",
    },
    {
      icon: Trophy,
      value: data.totalPracticeSetsCompleted.toLocaleString(),
      label: "Practice Sets",
      color: "text-purple-400",
      iconBg: "bg-purple-400/10",
    },
    {
      icon: MessageCircle,
      value: data.totalConversations.toLocaleString(),
      label: "Conversations",
      color: "text-cyan-400",
      iconBg: "bg-cyan-400/10",
    },
  ];

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader>
        <CardTitle className="text-lg text-white">Personal Bests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
