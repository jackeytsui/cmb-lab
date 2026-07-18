"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { cn } from "@/lib/utils";

type Band = "thriving" | "healthy" | "watch" | "at_risk" | "critical";
type Trend = "improving" | "steady" | "declining";
type Severity = "info" | "low" | "medium" | "high" | "critical";
type Priority = "low" | "medium" | "high" | "urgent";

interface Factor {
  key: string;
  label: string;
  score: number;
  detail: string;
  notApplicable: boolean;
}
interface Signal {
  type: string;
  severity: Severity;
  title: string;
  detail: string;
}
interface Action {
  key: string;
  title: string;
  description: string;
  priority: Priority;
  reason: string;
}
interface CustomerRow {
  userId: string;
  name: string | null;
  email: string | null;
  score: number;
  band: Band;
  trend: Trend;
  churnRisk: number;
  summary: string;
  lastActivityAt: string | null;
  lessonsCompleted: number;
  lessonsLast30: number;
  onboardingCompleted: boolean;
  factors: Factor[];
  signals: Signal[];
  actions: Action[];
}
interface BookResponse {
  summary: {
    totalCustomers: number;
    avgScore: number;
    atRiskCount: number;
    openSignals: number;
    bandCounts: Record<Band, number>;
  };
  customers: CustomerRow[];
  computedAt: string;
}

const BAND_META: Record<Band, { label: string; dot: string; chip: string }> = {
  thriving: {
    label: "Thriving",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
  healthy: {
    label: "Healthy",
    dot: "bg-green-500",
    chip: "bg-green-500/15 text-green-500 border-green-500/30",
  },
  watch: {
    label: "Watch",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  },
  at_risk: {
    label: "At risk",
    dot: "bg-orange-500",
    chip: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  },
  critical: {
    label: "Critical",
    dot: "bg-red-500",
    chip: "bg-red-500/15 text-red-500 border-red-500/30",
  },
};

const SEVERITY_CHIP: Record<Severity, string> = {
  info: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
};

const PRIORITY_CHIP: Record<Priority, string> = {
  low: "bg-slate-500/15 text-slate-400",
  medium: "bg-amber-500/15 text-amber-500",
  high: "bg-orange-500/15 text-orange-500",
  urgent: "bg-red-500/15 text-red-500",
};

const BANDS: Band[] = ["critical", "at_risk", "watch", "healthy", "thriving"];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "improving")
    return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
  if (trend === "declining")
    return <ArrowDownRight className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-muted-foreground", tone)}>{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-bold text-foreground", tone)}>
        {value}
      </div>
    </div>
  );
}

export function CsmCommandCenter({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<BookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bandFilter, setBandFilter] = useState<Band | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/csm/book");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load book of business");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/csm/book", { method: "POST" });
      if (!res.ok) throw new Error(`Recompute failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.customers.filter((c) => {
      if (bandFilter !== "all" && c.band !== bandFilter) return false;
      if (!q) return true;
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, bandFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Success Command Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live customer health, risk signals, and next-best-actions across your
            book of business.
            {data && (
              <span className="ml-1">
                Updated {timeAgo(data.computedAt)}.
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={recompute} disabled={recomputing}>
              <Activity
                className={cn("mr-1 h-4 w-4", recomputing && "animate-pulse")}
              />
              {recomputing ? "Snapshotting…" : "Recompute & snapshot"}
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Customers"
            value={data.summary.totalCustomers}
            icon={<Activity className="h-4 w-4" />}
          />
          <Kpi
            label="Avg health"
            value={data.summary.avgScore}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <Kpi
            label="At risk"
            value={data.summary.atRiskCount}
            tone={data.summary.atRiskCount > 0 ? "text-orange-500" : undefined}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <Kpi
            label="Open signals"
            value={data.summary.openSignals}
            icon={<ShieldAlert className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Band distribution */}
      {data && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Health distribution
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {BANDS.map((band) => {
              const count = data.summary.bandCounts[band];
              const pct = data.summary.totalCustomers
                ? (count / data.summary.totalCustomers) * 100
                : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={band}
                  className={BAND_META[band].dot}
                  style={{ width: `${pct}%` }}
                  title={`${BAND_META[band].label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip
              active={bandFilter === "all"}
              onClick={() => setBandFilter("all")}
              label={`All (${data.summary.totalCustomers})`}
            />
            {BANDS.map((band) => (
              <FilterChip
                key={band}
                active={bandFilter === band}
                onClick={() => setBandFilter(band)}
                dot={BAND_META[band].dot}
                label={`${BAND_META[band].label} (${data.summary.bandCounts[band]})`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      {/* Worklist */}
      {loading && !data ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Assessing book of business…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No customers match this filter.
            </div>
          )}
          {filtered.map((c) => (
            <CustomerCard
              key={c.userId}
              customer={c}
              expanded={expanded === c.userId}
              onToggle={() =>
                setExpanded(expanded === c.userId ? null : c.userId)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      {label}
    </button>
  );
}

function CustomerCard({
  customer: c,
  expanded,
  onToggle,
}: {
  customer: CustomerRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = BAND_META[c.band];
  const topSignal = c.signals[0];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-muted/40"
      >
        {/* Score ring */}
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold",
              meta.chip,
            )}
          >
            {c.score}
          </div>
        </div>

        {/* Identity + summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-foreground">
              {c.name || c.email || "Unknown"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                meta.chip,
              )}
            >
              {meta.label}
            </span>
            <TrendIcon trend={c.trend} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {c.summary}
          </p>
        </div>

        {/* Quick stats */}
        <div className="hidden shrink-0 items-center gap-4 text-right md:flex">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">
              Churn risk
            </div>
            <div
              className={cn(
                "text-sm font-semibold",
                c.churnRisk >= 60
                  ? "text-red-500"
                  : c.churnRisk >= 35
                    ? "text-orange-500"
                    : "text-foreground",
              )}
            >
              {c.churnRisk}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">
              Last active
            </div>
            <div className="text-sm text-foreground">
              {timeAgo(c.lastActivityAt)}
            </div>
          </div>
          {topSignal && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                SEVERITY_CHIP[topSignal.severity],
              )}
            >
              {topSignal.title}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-background/40 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Factors */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Health contributors
              </h4>
              <div className="space-y-2">
                {c.factors.map((f) => (
                  <div key={f.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{f.label}</span>
                      <span
                        className={cn(
                          "font-medium",
                          f.notApplicable
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        {f.notApplicable ? "n/a" : f.score}
                      </span>
                    </div>
                    {!f.notApplicable && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            f.score >= 60
                              ? "bg-green-500"
                              : f.score >= 40
                                ? "bg-amber-500"
                                : "bg-red-500",
                          )}
                          style={{ width: `${f.score}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {f.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Signals */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Risk & opportunity signals
              </h4>
              {c.signals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active signals.
                </p>
              ) : (
                <div className="space-y-2">
                  {c.signals.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            SEVERITY_CHIP[s.severity],
                          )}
                        >
                          {s.severity}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {s.title}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {s.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Next-best-actions */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Next best actions
              </h4>
              {c.actions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No action needed — keep nurturing.
                </p>
              ) : (
                <div className="space-y-2">
                  {c.actions.map((a) => (
                    <div
                      key={a.key}
                      className="rounded-lg border border-border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            PRIORITY_CHIP[a.priority],
                          )}
                        >
                          {a.priority}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {a.title}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {a.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>{c.lessonsCompleted} lessons completed</span>
            <span>{c.lessonsLast30} in last 30d</span>
            <span>
              Onboarding: {c.onboardingCompleted ? "complete" : "incomplete"}
            </span>
            {c.email && <span className="truncate">{c.email}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
