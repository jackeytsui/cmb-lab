"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  Flame,
  Info,
  MessageCircleMore,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RING_GOALS, XP_AMOUNTS } from "@/lib/xp";

interface XPDashboardData {
  level: {
    level: number;
    currentLevelXP: number;
    nextLevelXP: number;
    totalXP: number;
  };
  streak: {
    currentStreak: number;
    longestStreak: number;
    freezesUsedThisMonth: number;
    freezesRemaining: number;
  };
  daily: {
    totalXp: number;
    lessonCount: number;
    practiceCount: number;
    conversationCount: number;
    goalXp: number;
    goalMet: boolean;
  };
  rings: {
    learn: number;
    practice: number;
    speak: number;
  };
}

const XP_REWARDS = [
  { label: "Complete a lesson", reward: `+${XP_AMOUNTS.lesson_complete} XP` },
  {
    label: "Finish a practice exercise",
    reward: `+${XP_AMOUNTS.practice_exercise_min}–${XP_AMOUNTS.practice_exercise_max} XP`,
  },
  {
    label: "Get a perfect practice score",
    reward: `+${XP_AMOUNTS.practice_perfect} XP bonus`,
  },
  {
    label: "Complete a voice conversation",
    reward: `+${XP_AMOUNTS.voice_conversation} XP`,
  },
  {
    label: "Reach your daily XP goal",
    reward: `+${XP_AMOUNTS.daily_goal_met} XP bonus`,
  },
] as const;

function XPOverviewSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <Skeleton className="h-6 w-40" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-28 rounded-xl" />
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Star;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {label}
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActivityBar({
  label,
  current,
  goal,
  icon: Icon,
  barClassName,
}: {
  label: string;
  current: number;
  goal: number;
  icon: typeof Star;
  barClassName: string;
}) {
  const percent = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {label}
        </span>
        <span className="font-semibold tabular-nums text-muted-foreground">
          {current}/{goal}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function XPOverview() {
  const [data, setData] = useState<XPDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchXPData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/xp", { signal });
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Failed to load XP data (${res.status})`);
      }
      setData(await res.json());
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }
      console.error("[XPOverview] Fetch failed:", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load XP data",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchXPData(controller.signal);
    return () => controller.abort();
  }, [fetchXPData]);

  if (loading) return <XPOverviewSkeleton />;

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">XP &amp; activity</h2>
        <ErrorAlert
          variant="block"
          message={error}
          onRetry={() => void fetchXPData()}
        />
      </div>
    );
  }

  if (!data) return null;

  const dailyPercent =
    data.daily.goalXp > 0
      ? Math.min((data.daily.totalXp / data.daily.goalXp) * 100, 100)
      : 0;
  const levelPercent =
    data.level.nextLevelXP > 0
      ? Math.min(
          (data.level.currentLevelXP / data.level.nextLevelXP) * 100,
          100,
        )
      : 100;

  return (
    <section
      aria-labelledby="xp-activity-heading"
      className="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-[#4a9fe3]/[0.08] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2b705]/15 text-[#9a7200] dark:text-[#f2c94c]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 id="xp-activity-heading" className="text-lg font-bold text-foreground">
              XP &amp; activity
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Earn XP by completing learning activities. XP builds your level,
            while activity tracks what you finish each day.
          </p>
        </div>
        <span className="rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1 text-xs font-semibold text-primary">
          {data.daily.goalMet ? "Daily goal complete" : `${Math.round(dailyPercent)}% of daily goal`}
        </span>
      </div>

      <details className="group mt-4 rounded-xl border border-primary/15 bg-primary/[0.045] open:bg-primary/[0.065]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground marker:content-none">
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
            How XP &amp; activity work
          </span>
          <span className="text-xs font-medium text-primary group-open:hidden">
            Show details
          </span>
          <span className="hidden text-xs font-medium text-primary group-open:inline">
            Hide details
          </span>
        </summary>
        <div className="border-t border-primary/10 px-4 py-4">
          <p className="text-xs leading-5 text-muted-foreground">
            XP are progress points—not grades, and they do not change your course
            access. Your total XP raises your level; today&apos;s XP resets each day.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {XP_REWARDS.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-background/75 p-3"
              >
                <p className="text-xs font-medium leading-4 text-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-xs font-bold text-primary">
                  {item.reward}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            <strong className="font-semibold text-foreground">Streak</strong> counts
            consecutive study days. Up to two monthly freezes can protect a missed
            day. <strong className="font-semibold text-foreground">Learn, Practice,
            and Speak</strong> count today&apos;s completed lessons, exercises, and voice
            conversations toward targets of {RING_GOALS.learn}, {RING_GOALS.practice},
            and {RING_GOALS.speak}.
          </p>
        </div>
      </details>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Level"
          value={data.level.level}
          detail={`${Math.round(levelPercent)}% to next level`}
          icon={Trophy}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <Stat
          label="Today"
          value={`${data.daily.totalXp} XP`}
          detail={`${data.daily.goalXp} XP daily goal`}
          icon={Target}
          tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <Stat
          label="Streak"
          value={`${data.streak.currentStreak} days`}
          detail={`Best: ${data.streak.longestStreak} days`}
          icon={Flame}
          tone="bg-orange-500/10 text-orange-600 dark:text-orange-400"
        />
        <Stat
          label="Total"
          value={`${data.level.totalXP.toLocaleString()} XP`}
          detail={`${data.streak.freezesRemaining} streak freezes left`}
          icon={Star}
          tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />
      </div>

      <div className="mt-4 grid gap-5 rounded-xl border border-border bg-background/70 p-4 sm:grid-cols-2 sm:p-5">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">Today&apos;s XP goal</span>
            <span className="font-bold tabular-nums text-primary">
              {data.daily.totalXp} / {data.daily.goalXp}
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-primary/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2e3a97] via-[#4354bd] to-[#4a9fe3]"
              style={{ width: `${dailyPercent}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {data.daily.goalMet
              ? "Nice work — your daily target is complete."
              : `${Math.max(data.daily.goalXp - data.daily.totalXp, 0)} XP to go today.`}
          </p>
        </div>

        <div className="grid gap-3">
          <ActivityBar
            label="Learn"
            current={data.daily.lessonCount}
            goal={RING_GOALS.learn}
            icon={BookOpenCheck}
            barClassName="bg-emerald-500"
          />
          <ActivityBar
            label="Practice"
            current={data.daily.practiceCount}
            goal={RING_GOALS.practice}
            icon={Target}
            barClassName="bg-blue-500"
          />
          <ActivityBar
            label="Speak"
            current={data.daily.conversationCount}
            goal={RING_GOALS.speak}
            icon={MessageCircleMore}
            barClassName="bg-amber-500"
          />
        </div>
      </div>
    </section>
  );
}
