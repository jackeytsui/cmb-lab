"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { OverviewCards } from "./components/OverviewCards";
import { ErrorAlert } from "@/components/ui/error-alert";

interface DateRange {
  from: string;
  to: string;
}

interface EngagementOverview {
  activeStudents: number;
  totalEvents: number;
  actionEvents: number;
  totalSessions: number;
  totalMinutes: number;
  avgEventsPerActiveStudent: number;
  avgSessionMinutes: number;
  avgActiveMinutesPerActiveStudent: number;
  topFeature: string | null;
}

interface FeatureRow {
  featureKey: string;
  featureLabel: string;
  activeStudents: number;
  totalEvents: number;
  actions: number;
  sessions: number;
  avgSessionMinutes: number;
}

interface StudentRow {
  userId: string;
  name: string | null;
  email: string | null;
  totalEvents: number;
  actions: number;
  sessions: number;
  totalMinutes: number;
  topFeatureLabel: string | null;
  lastActivityAt: string | null;
}

function buildParams(range: DateRange): string {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const str = params.toString();
  return str ? `?${str}` : "";
}

function exportUrl(metric: string, range: DateRange): string {
  const params = new URLSearchParams();
  params.set("metric", metric);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return `/api/admin/analytics/export?${params.toString()}`;
}

const EMPTY_OVERVIEW = {
  activeStudents: 0,
  totalStudents: 0,
  inactiveStudentsLoggedInOnce: 0,
  inactiveStudentsNeverLoggedIn: 0,
};

const EMPTY_ENGAGEMENT: EngagementOverview = {
  activeStudents: 0,
  totalEvents: 0,
  actionEvents: 0,
  totalSessions: 0,
  totalMinutes: 0,
  avgEventsPerActiveStudent: 0,
  avgSessionMinutes: 0,
  avgActiveMinutesPerActiveStudent: 0,
  topFeature: null,
};

export function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 7);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [engagementOverview, setEngagementOverview] =
    useState<EngagementOverview>(EMPTY_ENGAGEMENT);
  const [engagementFeatures, setEngagementFeatures] = useState<FeatureRow[]>([]);
  const [engagementStudents, setEngagementStudents] = useState<StudentRow[]>([]);
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string>("all");

  const fetchData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    const qs = buildParams(range);

    try {
      const [overviewRes, engagementRes] = await Promise.all([
        fetch(`/api/admin/analytics/overview${qs}`),
        fetch(`/api/admin/analytics/engagement${qs}`),
      ]);

      if (!overviewRes.ok && !engagementRes.ok) {
        setError("Failed to load analytics. Please retry.");
      }

      if (overviewRes.ok) {
        setOverview(await overviewRes.json());
      } else {
        setOverview(EMPTY_OVERVIEW);
      }

      if (engagementRes.ok) {
        const data = await engagementRes.json();
        setEngagementOverview(data.overview ?? EMPTY_ENGAGEMENT);
        setEngagementFeatures(data.features ?? []);
        setEngagementStudents(data.students ?? []);
      } else {
        setEngagementOverview(EMPTY_ENGAGEMENT);
        setEngagementFeatures([]);
        setEngagementStudents([]);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setError("Failed to load analytics data. Please try again.");
      setOverview(EMPTY_OVERVIEW);
      setEngagementOverview(EMPTY_ENGAGEMENT);
      setEngagementFeatures([]);
      setEngagementStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(dateRange);
  }, [fetchData, dateRange]);

  const featureOptions = useMemo(
    () =>
      engagementFeatures.map((item) => ({
        key: item.featureKey,
        label: item.featureLabel,
      })),
    [engagementFeatures],
  );

  const filteredFeatures = useMemo(() => {
    if (selectedFeatureKey === "all") return engagementFeatures;
    return engagementFeatures.filter((row) => row.featureKey === selectedFeatureKey);
  }, [engagementFeatures, selectedFeatureKey]);

  const filteredStudents = useMemo(() => {
    if (selectedFeatureKey === "all") return engagementStudents;
    const selectedFeatureLabel =
      engagementFeatures.find((f) => f.featureKey === selectedFeatureKey)?.featureLabel ?? null;
    if (!selectedFeatureLabel) return [];
    return engagementStudents.filter((row) => row.topFeatureLabel === selectedFeatureLabel);
  }, [engagementFeatures, engagementStudents, selectedFeatureKey]);

  return (
    <div className="space-y-8">
      <DateRangeFilter onChange={setDateRange} />

      {error && <ErrorAlert message={error} onRetry={() => fetchData(dateRange)} />}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Overview</h2>
        <OverviewCards {...overview} loading={loading} />
        <p className="mt-2 text-xs text-muted-foreground">
          Users tagged <code>analytics_whitelist</code> or <code>analytics-whitelist</code> are excluded.
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Most Engaged Students</h2>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl("engagement_students", dateRange)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              Students CSV
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-left">Events</th>
                <th className="px-3 py-2 text-left">Actions</th>
                <th className="px-3 py-2 text-left">Sessions</th>
                <th className="px-3 py-2 text-left">Minutes</th>
                <th className="px-3 py-2 text-left">Top Feature</th>
                <th className="px-3 py-2 text-left">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.slice(0, 15).map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{row.name || "Student"}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-3 py-2 text-foreground">{row.totalEvents}</td>
                  <td className="px-3 py-2 text-foreground">{row.actions}</td>
                  <td className="px-3 py-2 text-foreground">{row.sessions}</td>
                  <td className="px-3 py-2 text-foreground">{row.totalMinutes}</td>
                  <td className="px-3 py-2 text-foreground">{row.topFeatureLabel ?? "N/A"}</td>
                  <td className="px-3 py-2 text-foreground">
                    {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : "Never"}
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                    No student engagement data for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Released Feature Engagement</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="feature-filter" className="text-sm text-muted-foreground">
              Feature
            </label>
            <select
              id="feature-filter"
              value={selectedFeatureKey}
              onChange={(e) => setSelectedFeatureKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="all">All features</option>
              {featureOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <a
              href={exportUrl("engagement_features", dateRange)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              Features CSV
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Active Students</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{engagementOverview.activeStudents}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total Events</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{engagementOverview.totalEvents}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total Session Minutes</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{engagementOverview.totalMinutes}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Avg Active Minutes / Active Student</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {engagementOverview.avgActiveMinutesPerActiveStudent}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Active Students</th>
                <th className="px-3 py-2 text-left">Events</th>
                <th className="px-3 py-2 text-left">Actions</th>
                <th className="px-3 py-2 text-left">Sessions</th>
                <th className="px-3 py-2 text-left">Avg Session (min)</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeatures.map((row) => (
                <tr key={row.featureKey} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{row.featureLabel}</td>
                  <td className="px-3 py-2 text-foreground">{row.activeStudents}</td>
                  <td className="px-3 py-2 text-foreground">{row.totalEvents}</td>
                  <td className="px-3 py-2 text-foreground">{row.actions}</td>
                  <td className="px-3 py-2 text-foreground">{row.sessions}</td>
                  <td className="px-3 py-2 text-foreground">{row.avgSessionMinutes}</td>
                </tr>
              ))}
              {filteredFeatures.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    No feature engagement data for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
