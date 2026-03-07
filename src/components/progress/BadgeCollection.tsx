"use client";

import {
  BookOpen,
  GraduationCap,
  Library,
  Flame,
  Trophy,
  Star,
  Award,
  Target,
  Zap,
  Crown,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BadgeResult } from "@/lib/badges";

// ============================================================
// Icon Lookup
// ============================================================

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  GraduationCap,
  Library,
  Flame,
  Trophy,
  Star,
  Award,
  Target,
  Zap,
  Crown,
};

// ============================================================
// Sorting
// ============================================================

const CATEGORY_ORDER: Record<string, number> = {
  learning: 0,
  streak: 1,
  xp: 2,
  practice: 3,
};

function sortBadges(badges: BadgeResult[]): BadgeResult[] {
  const earned = badges
    .filter((b) => b.earned)
    .sort(
      (a, b) =>
        (CATEGORY_ORDER[a.badge.category] ?? 99) -
        (CATEGORY_ORDER[b.badge.category] ?? 99)
    );

  const locked = badges
    .filter((b) => !b.earned)
    .sort((a, b) => {
      // Sort by progress percentage descending (closest to earning first)
      const aPct = a.target === 0 ? 0 : a.progress / a.target;
      const bPct = b.target === 0 ? 0 : b.progress / b.target;
      return bPct - aPct;
    });

  return [...earned, ...locked];
}

// ============================================================
// BadgeCollection
// ============================================================

interface BadgeCollectionProps {
  badges: BadgeResult[];
}

export function BadgeCollection({ badges }: BadgeCollectionProps) {
  const sorted = sortBadges(badges);
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-2">Badges</h2>
      <p className="text-sm text-zinc-400 mb-4">
        {earnedCount} of {badges.length} earned
      </p>

      {badges.length === 0 ? (
        <p className="text-zinc-500 text-center py-8">No badges available</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map((result) => (
            <BadgeCard key={result.badge.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BadgeCard
// ============================================================

function BadgeCard({ result }: { result: BadgeResult }) {
  const { badge, earned, progress, target } = result;
  const IconComponent = ICON_MAP[badge.icon] ?? Trophy;
  const progressPct = target === 0 ? 0 : Math.round((progress / target) * 100);

  return (
    <div
      className={`relative p-3 rounded-lg border text-center ${
        earned
          ? "bg-zinc-800/50 border-emerald-500/30"
          : "bg-zinc-900/30 border-zinc-800 opacity-60"
      }`}
    >
      {/* Earned check indicator */}
      {earned && (
        <div className="absolute top-1.5 right-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        </div>
      )}

      {/* Icon */}
      <IconComponent
        className={`h-8 w-8 mx-auto mb-2 ${
          earned ? "text-emerald-400" : "text-zinc-600"
        }`}
      />

      {/* Title */}
      <p
        className={`text-sm font-medium ${
          earned ? "text-white" : "text-zinc-500"
        }`}
      >
        {badge.title}
      </p>

      {/* Description */}
      <p
        className={`text-xs mt-0.5 ${
          earned ? "text-zinc-400" : "text-zinc-600"
        }`}
      >
        {badge.description}
      </p>

      {/* Progress indicator (locked only) */}
      {!earned && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-zinc-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-600 mt-1">
            {progress}/{target}
          </p>
        </div>
      )}
    </div>
  );
}
