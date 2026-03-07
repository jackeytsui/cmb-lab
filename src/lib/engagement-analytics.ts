import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { featureEngagementEvents, users } from "@/db/schema";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

export const RELEASED_ENGAGEMENT_FEATURES = [
  "ai_passage_reader",
  "youtube_listening_lab",
  "coaching_one_on_one",
  "coaching_inner_circle",
] as const;

export type EngagementFeature = (typeof RELEASED_ENGAGEMENT_FEATURES)[number];

export function featureLabel(feature: EngagementFeature) {
  switch (feature) {
    case "ai_passage_reader":
      return "AI Passage Reader";
    case "youtube_listening_lab":
      return "YouTube Listening Lab";
    case "coaching_one_on_one":
      return "1:1 Coaching";
    case "coaching_inner_circle":
      return "Inner Circle Coaching";
    default:
      return feature;
  }
}

function buildDateRangeConditions(from: Date | null, to: Date | null) {
  const conditions = [];
  if (from) conditions.push(gte(featureEngagementEvents.createdAt, from));
  if (to) conditions.push(lte(featureEngagementEvents.createdAt, to));
  return conditions;
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getEngagementOverview(from: Date | null, to: Date | null) {
  const dateConditions = buildDateRangeConditions(from, to);
  const baseWhere = and(
    eq(users.role, "student"),
    excludeWhitelistedUsersSql(users.id),
    ...dateConditions,
  );

  const [counts] = await db
    .select({
      activeStudents: sql<number>`COUNT(DISTINCT ${featureEngagementEvents.userId})`,
      totalEvents: sql<number>`COUNT(*)`,
      totalSessions: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN 1 END)`,
      totalDurationMs: sql<number>`COALESCE(SUM(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN COALESCE(${featureEngagementEvents.durationMs}, 0) ELSE 0 END), 0)`,
      actionEvents: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'action' THEN 1 END)`,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere);

  const topFeatureResult = await db
    .select({
      feature: featureEngagementEvents.feature,
      eventCount: sql<number>`COUNT(*)`,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere)
    .groupBy(featureEngagementEvents.feature)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(1);

  const activeStudents = Number(counts?.activeStudents ?? 0);
  const totalEvents = Number(counts?.totalEvents ?? 0);
  const totalSessions = Number(counts?.totalSessions ?? 0);
  const totalMinutes = roundOneDecimal(
    Number(counts?.totalDurationMs ?? 0) / 60000,
  );
  const avgEventsPerActiveStudent =
    activeStudents > 0 ? roundOneDecimal(totalEvents / activeStudents) : 0;
  const avgSessionMinutes =
    totalSessions > 0 ? roundOneDecimal(totalMinutes / totalSessions) : 0;
  const avgActiveMinutesPerActiveStudent =
    activeStudents > 0 ? roundOneDecimal(totalMinutes / activeStudents) : 0;
  const topFeature = topFeatureResult[0]?.feature as EngagementFeature | undefined;

  return {
    activeStudents,
    totalEvents,
    totalSessions,
    totalMinutes,
    actionEvents: Number(counts?.actionEvents ?? 0),
    avgEventsPerActiveStudent,
    avgSessionMinutes,
    avgActiveMinutesPerActiveStudent,
    topFeature: topFeature ? featureLabel(topFeature) : null,
    topFeatureKey: topFeature ?? null,
  };
}

export async function getEngagementByFeature(from: Date | null, to: Date | null) {
  const dateConditions = buildDateRangeConditions(from, to);
  const baseWhere = and(
    eq(users.role, "student"),
    excludeWhitelistedUsersSql(users.id),
    ...dateConditions,
  );

  const rows = await db
    .select({
      feature: featureEngagementEvents.feature,
      activeStudents: sql<number>`COUNT(DISTINCT ${featureEngagementEvents.userId})`,
      totalEvents: sql<number>`COUNT(*)`,
      pageViews: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'page_view' THEN 1 END)`,
      actions: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'action' THEN 1 END)`,
      sessions: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN 1 END)`,
      durationMs: sql<number>`COALESCE(SUM(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN COALESCE(${featureEngagementEvents.durationMs}, 0) ELSE 0 END), 0)`,
      activeDays: sql<number>`COUNT(DISTINCT DATE(${featureEngagementEvents.createdAt}))`,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere)
    .groupBy(featureEngagementEvents.feature);

  const byFeature = new Map<
    string,
    {
      activeStudents: number;
      totalEvents: number;
      pageViews: number;
      actions: number;
      sessions: number;
      durationMs: number;
      activeDays: number;
    }
  >();
  for (const row of rows) {
    byFeature.set(row.feature, {
      activeStudents: Number(row.activeStudents ?? 0),
      totalEvents: Number(row.totalEvents ?? 0),
      pageViews: Number(row.pageViews ?? 0),
      actions: Number(row.actions ?? 0),
      sessions: Number(row.sessions ?? 0),
      durationMs: Number(row.durationMs ?? 0),
      activeDays: Number(row.activeDays ?? 0),
    });
  }

  return RELEASED_ENGAGEMENT_FEATURES.map((feature) => {
    const row = byFeature.get(feature) ?? {
      activeStudents: 0,
      totalEvents: 0,
      pageViews: 0,
      actions: 0,
      sessions: 0,
      durationMs: 0,
      activeDays: 0,
    };
    const totalMinutes = roundOneDecimal(row.durationMs / 60000);
    return {
      featureKey: feature,
      featureLabel: featureLabel(feature),
      activeStudents: row.activeStudents,
      totalEvents: row.totalEvents,
      pageViews: row.pageViews,
      actions: row.actions,
      sessions: row.sessions,
      totalMinutes,
      avgSessionMinutes:
        row.sessions > 0 ? roundOneDecimal(totalMinutes / row.sessions) : 0,
      activeDays: row.activeDays,
    };
  });
}

export async function getEngagedStudents(
  from: Date | null,
  to: Date | null,
  limit = 100,
) {
  const dateConditions = buildDateRangeConditions(from, to);
  const baseWhere = and(
    eq(users.role, "student"),
    excludeWhitelistedUsersSql(users.id),
    ...dateConditions,
  );

  const summaryRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      totalEvents: sql<number>`COUNT(*)`,
      actions: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'action' THEN 1 END)`,
      sessions: sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN 1 END)`,
      totalDurationMs: sql<number>`COALESCE(SUM(CASE WHEN ${featureEngagementEvents.eventType} = 'session_end' THEN COALESCE(${featureEngagementEvents.durationMs}, 0) ELSE 0 END), 0)`,
      lastActivityAt: sql<Date | null>`MAX(${featureEngagementEvents.createdAt})`,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere)
    .groupBy(users.id, users.name, users.email)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  if (summaryRows.length === 0) return [];

  const featureRows = await db
    .select({
      userId: featureEngagementEvents.userId,
      feature: featureEngagementEvents.feature,
      totalEvents: sql<number>`COUNT(*)`,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere)
    .groupBy(featureEngagementEvents.userId, featureEngagementEvents.feature)
    .orderBy(asc(featureEngagementEvents.userId), desc(sql`COUNT(*)`));

  const topFeatureByUser = new Map<string, EngagementFeature>();
  for (const row of featureRows) {
    if (!topFeatureByUser.has(row.userId)) {
      topFeatureByUser.set(row.userId, row.feature as EngagementFeature);
    }
  }

  return summaryRows.map((row) => {
    const topFeatureKey = topFeatureByUser.get(row.userId) ?? null;
    const totalMinutes = roundOneDecimal(Number(row.totalDurationMs ?? 0) / 60000);
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      totalEvents: Number(row.totalEvents ?? 0),
      actions: Number(row.actions ?? 0),
      sessions: Number(row.sessions ?? 0),
      totalMinutes,
      avgSessionMinutes:
        Number(row.sessions ?? 0) > 0
          ? roundOneDecimal(totalMinutes / Number(row.sessions))
          : 0,
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
      topFeatureKey,
      topFeatureLabel: topFeatureKey ? featureLabel(topFeatureKey) : null,
    };
  });
}

export async function getEngagementEventsForExport(
  from: Date | null,
  to: Date | null,
) {
  const dateConditions = buildDateRangeConditions(from, to);
  const baseWhere = and(
    eq(users.role, "student"),
    excludeWhitelistedUsersSql(users.id),
    ...dateConditions,
  );

  const rows = await db
    .select({
      createdAt: featureEngagementEvents.createdAt,
      feature: featureEngagementEvents.feature,
      eventType: featureEngagementEvents.eventType,
      action: featureEngagementEvents.action,
      sessionKey: featureEngagementEvents.sessionKey,
      durationMs: featureEngagementEvents.durationMs,
      route: featureEngagementEvents.route,
      userName: users.name,
      userEmail: users.email,
    })
    .from(featureEngagementEvents)
    .innerJoin(users, eq(featureEngagementEvents.userId, users.id))
    .where(baseWhere)
    .orderBy(desc(featureEngagementEvents.createdAt))
    .limit(10000);

  return rows.map((row) => ({
    createdAt: row.createdAt.toISOString(),
    featureKey: row.feature,
    featureLabel: featureLabel(row.feature as EngagementFeature),
    eventType: row.eventType,
    action: row.action ?? "",
    sessionKey: row.sessionKey ?? "",
    durationMs: row.durationMs ?? 0,
    route: row.route ?? "",
    userName: row.userName ?? "",
    userEmail: row.userEmail ?? "",
  }));
}
