"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface OverviewCardsProps {
  activeStudents: number;
  totalStudents: number;
  inactiveStudentsLoggedInOnce: number;
  inactiveStudentsNeverLoggedIn: number;
  loading: boolean;
}

const cards = [
  {
    key: "totalStudents",
    label: "Total Students",
    accent: "text-primary",
    border: "border-border",
  },
  {
    key: "activeStudents",
    label: "Active Students (7d)",
    accent: "text-emerald-500",
    border: "border-emerald-500/30",
  },
  {
    key: "inactiveStudentsLoggedInOnce",
    label: "Inactive (Logged In Before)",
    accent: "text-amber-500",
    border: "border-amber-500/30",
  },
  {
    key: "inactiveStudentsNeverLoggedIn",
    label: "Inactive (Never Logged In)",
    accent: "text-blue-500",
    border: "border-blue-500/30",
  },
] as const;

export function OverviewCards(props: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`rounded-lg border ${card.border} bg-card p-6`}
        >
          {props.loading ? (
            <>
              <Skeleton className="mb-2 h-9 w-16" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <p className={`text-3xl font-bold ${card.accent}`}>
                {props[card.key]}
              </p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
