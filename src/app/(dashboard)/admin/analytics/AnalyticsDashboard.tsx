"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Star } from "lucide-react";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { OverviewCards } from "./components/OverviewCards";
import { CompletionTable } from "./components/CompletionTable";
import { DropoffTable } from "./components/DropoffTable";
import { DifficultyTable } from "./components/DifficultyTable";
import { AtRiskTable } from "./components/AtRiskTable";
import { ErrorAlert } from "@/components/ui/error-alert";
import { cn } from "@/lib/utils";

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

interface CoachRating {
  coachId: string;
  coachName: string | null;
  coachEmail: string;
  avgRating: number | null;
  totalRatings: number;
}

interface SessionTypeRating {
  sessionType: string;
  avgRating: number | null;
  totalRatings: number;
}

interface RatingTrend {
  month: string;
  avgRating: number | null;
  totalRatings: number;
}

interface FeedbackEntry {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  sessionTitle: string;
  sessionType: string;
  studentName: string | null;
  studentEmail: string;
  coachName: string | null;
}

interface CompletionRow {
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  enrolledStudents: number;
  completedStudents: number;
  completionRate: number;
}

interface DropoffRow {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  startedCount: number;
  completedCount: number;
  dropoffCount: number;
  dropoffRate: number;
}

interface DifficultyRow {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  interactionCount: number;
  avgAttemptsToPass: number;
}

interface AtRiskRow {
  userId: string;
  name: string | null;
  email: string | null;
  lastActivity: string | null;
  daysSinceActivity: number | null;
  totalLessonsCompleted: number;
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

function ExportButton({ metric, range, label }: { metric: string; range: DateRange; label: string }) {
  return (
    <a
      href={exportUrl(metric, range)}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
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

  // Course & lesson analytics
  const [completion, setCompletion] = useState<CompletionRow[]>([]);
  const [dropoff, setDropoff] = useState<DropoffRow[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyRow[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskRow[]>([]);

  // Coaching feedback state
  const [coachRatings, setCoachRatings] = useState<CoachRating[]>([]);
  const [sessionTypeRatings, setSessionTypeRatings] = useState<SessionTypeRating[]>([]);
  const [ratingTrends, setRatingTrends] = useState<RatingTrend[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEntry[]>([]);

  const fetchData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    const qs = buildParams(range);

    try {
      const [overviewRes, engagementRes, ratingsRes, completionRes, dropoffRes, difficultyRes, studentsRes] =
        await Promise.all([
          fetch(`/api/admin/analytics/overview${qs}`),
          fetch(`/api/admin/analytics/engagement${qs}`),
          fetch(`/api/admin/analytics/coaching-ratings`),
          fetch(`/api/admin/analytics/completion${qs}`),
          fetch(`/api/admin/analytics/dropoff${qs}`),
          fetch(`/api/admin/analytics/difficulty${qs}`),
          fetch(`/api/admin/analytics/students${qs}`),
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

      if (ratingsRes.ok) {
        const data = await ratingsRes.json();
        setCoachRatings(data.perCoach ?? []);
        setSessionTypeRatings(data.perSessionType ?? []);
        setRatingTrends(data.trends ?? []);
        setRecentFeedback(data.recentFeedback ?? []);
      }

      setCompletion(completionRes.ok ? await completionRes.json() : []);
      setDropoff(dropoffRes.ok ? await dropoffRes.json() : []);
      setDifficulty(difficultyRes.ok ? await difficultyRes.json() : []);
      setAtRisk(studentsRes.ok ? await studentsRes.json() : []);
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

      {/* Overview */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Overview</h2>
          <ExportButton metric="overview" range={dateRange} label="Export CSV" />
        </div>
        <OverviewCards {...overview} loading={loading} />
        <p className="mt-2 text-xs text-muted-foreground">
          Users tagged <code>analytics_whitelist</code> or <code>analytics-whitelist</code> are excluded.
        </p>
      </section>

      {/* Course Completion */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Course Completion</h2>
          <ExportButton metric="completion" range={dateRange} label="Export CSV" />
        </div>
        <CompletionTable data={completion} loading={loading} />
      </section>

      {/* Lesson Drop-off */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Lesson Drop-off</h2>
          <ExportButton metric="dropoff" range={dateRange} label="Export CSV" />
        </div>
        <DropoffTable data={dropoff} loading={loading} />
      </section>

      {/* Lesson Difficulty */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Lesson Difficulty</h2>
          <ExportButton metric="difficulty" range={dateRange} label="Export CSV" />
        </div>
        <DifficultyTable data={difficulty} loading={loading} />
      </section>

      {/* At-Risk Students */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">At-Risk Students</h2>
          <ExportButton metric="students" range={dateRange} label="Export CSV" />
        </div>
        <AtRiskTable data={atRisk} loading={loading} />
      </section>

      {/* Most Engaged Students */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Most Engaged Students</h2>
          <ExportButton metric="engagement_students" range={dateRange} label="Export CSV" />
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

      {/* Feature Engagement */}
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
            <ExportButton metric="engagement_features" range={dateRange} label="Features CSV" />
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

      {/* Coaching Session Feedback */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Coaching Session Feedback</h2>

        {/* Summary cards: per session type */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
          {sessionTypeRatings.map((st) => (
            <div key={st.sessionType} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                {st.sessionType === "one_on_one" ? "1:1 Coaching" : "Inner Circle"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xl font-semibold text-foreground">
                  {st.avgRating !== null ? st.avgRating.toFixed(1) : "N/A"}
                </p>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        "h-3.5 w-3.5",
                        st.avgRating !== null && s <= Math.round(st.avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-none text-muted-foreground/40",
                      )}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">({st.totalRatings} reviews)</span>
              </div>
            </div>
          ))}
          {sessionTypeRatings.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-3 col-span-3">
              <p className="text-sm text-muted-foreground text-center py-2">No feedback data yet.</p>
            </div>
          )}
        </div>

        {/* Per-coach breakdown */}
        {coachRatings.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Coach</th>
                  <th className="px-3 py-2 text-left">Avg Rating</th>
                  <th className="px-3 py-2 text-left">Total Reviews</th>
                </tr>
              </thead>
              <tbody>
                {coachRatings.map((row) => (
                  <tr key={row.coachId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{row.coachName || "Coach"}</div>
                      <div className="text-xs text-muted-foreground">{row.coachEmail}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {row.avgRating !== null ? row.avgRating.toFixed(1) : "N/A"}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={cn(
                                "h-3 w-3",
                                row.avgRating !== null && s <= Math.round(row.avgRating)
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-none text-muted-foreground/40",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.totalRatings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Monthly trends */}
        {ratingTrends.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-left">Avg Rating</th>
                  <th className="px-3 py-2 text-left">Total Reviews</th>
                </tr>
              </thead>
              <tbody>
                {ratingTrends.map((row) => (
                  <tr key={row.month} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{row.month}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {row.avgRating !== null ? row.avgRating.toFixed(1) : "N/A"}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={cn(
                                "h-3 w-3",
                                row.avgRating !== null && s <= Math.round(row.avgRating)
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-none text-muted-foreground/40",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.totalRatings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent individual feedback */}
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent Student Feedback</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-left">Session</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Rating</th>
                <th className="px-3 py-2 text-left">Comment</th>
                <th className="px-3 py-2 text-left">Coach</th>
                <th className="px-3 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentFeedback.map((fb) => (
                <tr key={fb.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{fb.studentName || "Student"}</div>
                    <div className="text-xs text-muted-foreground">{fb.studentEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-foreground max-w-[150px] truncate">{fb.sessionTitle}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      fb.sessionType === "one_on_one"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-violet-500/10 text-violet-400",
                    )}>
                      {fb.sessionType === "one_on_one" ? "1:1" : "Inner Circle"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={cn(
                            "h-3 w-3",
                            s <= fb.rating
                              ? "fill-amber-400 text-amber-400"
                              : "fill-none text-muted-foreground/40",
                          )}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                    {fb.comment ? (
                      <span className="italic text-foreground/80 line-clamp-2">&ldquo;{fb.comment}&rdquo;</span>
                    ) : (
                      <span className="text-muted-foreground/50">No comment</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">{fb.coachName || "Coach"}</td>
                  <td className="px-3 py-2 text-foreground text-xs">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {recentFeedback.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                    No student feedback submitted yet.
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
