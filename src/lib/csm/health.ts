import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  lessonProgress,
  featureEngagementEvents,
  dailyActivity,
  coachingSessions,
  coachingSessionRatings,
  activeStudents,
} from "@/db/schema";
import type { CustomerSignals } from "./types";

// ============================================================
// Data loaders — gather CustomerSignals from the LMS + CRM.
//
// The pure scoring engine lives in ./scoring (IO-free, unit-tested). These
// loaders read the LMS behavioural tables + the GHL CRM mirror and assemble the
// CustomerSignals struct the scorer consumes. Re-exports the scorer so existing
// imports from "@/lib/csm/health" keep working.
// ============================================================

export { scoreHealth, bandForScore } from "./scoring";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Load signals for all active students in a single batched pass. Uses grouped
 * aggregate queries (mirrors the existing analytics/overview pattern) so it
 * scales to the whole book of business without N+1 queries.
 */
export async function loadAllCustomerSignals(): Promise<
  Map<string, CustomerSignals>
> {
  const now = new Date();
  const win30 = new Date(now.getTime() - 30 * DAY_MS);
  const win60 = new Date(now.getTime() - 60 * DAY_MS);
  const win14 = new Date(now.getTime() - 14 * DAY_MS);

  // Base roster: active students.
  const roster = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      longestStreak: users.longestStreak,
      assignedCoachId: users.assignedCoachId,
    })
    .from(users)
    .where(and(eq(users.role, "student"), isNull(users.deletedAt)));

  const byId = new Map<string, CustomerSignals>();
  const idByEmail = new Map<string, string>();
  for (const u of roster) {
    if (u.email) idByEmail.set(u.email.toLowerCase(), u.id);
    byId.set(u.id, {
      userId: u.id,
      now,
      createdAt: u.createdAt ?? null,
      lastActivityAt: null,
      lessonsCompleted: 0,
      lessonsCompletedLast30: 0,
      lessonsCompletedPrev30: 0,
      activeDaysLast14: 0,
      longestStreak: u.longestStreak ?? 0,
      currentStreak: 0,
      onboardingCompleted: false,
      hasAssignedCoach: Boolean(u.assignedCoachId),
      lastCoachingAt: null,
      avgCoachingRating: null,
      satisfactionRating: null,
      paymentStatus: null,
      productEndDate: null,
    });
  }

  // Lesson progress aggregates: last access, completions total / windowed.
  const lp = await db
    .select({
      userId: lessonProgress.userId,
      lastAccess: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`,
      completedTotal: sql<number>`COUNT(${lessonProgress.completedAt})`,
      completedLast30: sql<number>`COUNT(*) FILTER (WHERE ${lessonProgress.completedAt} >= ${win30.toISOString()})`,
      completedPrev30: sql<number>`COUNT(*) FILTER (WHERE ${lessonProgress.completedAt} >= ${win60.toISOString()} AND ${lessonProgress.completedAt} < ${win30.toISOString()})`,
    })
    .from(lessonProgress)
    .groupBy(lessonProgress.userId);
  for (const row of lp) {
    const sig = byId.get(row.userId);
    if (!sig) continue;
    sig.lastActivityAt = row.lastAccess ? new Date(row.lastAccess) : null;
    sig.lessonsCompleted = Number(row.completedTotal) || 0;
    sig.lessonsCompletedLast30 = Number(row.completedLast30) || 0;
    sig.lessonsCompletedPrev30 = Number(row.completedPrev30) || 0;
    sig.onboardingCompleted = sig.lessonsCompleted > 0;
  }

  // Engagement events: fold max event time into lastActivityAt.
  const ev = await db
    .select({
      userId: featureEngagementEvents.userId,
      lastEvent: sql<Date | null>`MAX(${featureEngagementEvents.createdAt})`,
    })
    .from(featureEngagementEvents)
    .groupBy(featureEngagementEvents.userId);
  for (const row of ev) {
    const sig = byId.get(row.userId);
    if (!sig || !row.lastEvent) continue;
    const t = new Date(row.lastEvent);
    if (!sig.lastActivityAt || t > sig.lastActivityAt) sig.lastActivityAt = t;
  }

  // Consistency: distinct active days in the last 14.
  const da = await db
    .select({
      userId: dailyActivity.userId,
      activeDays: sql<number>`COUNT(*)`,
    })
    .from(dailyActivity)
    .where(gte(dailyActivity.activityDate, win14.toISOString().slice(0, 10)))
    .groupBy(dailyActivity.userId);
  for (const row of da) {
    const sig = byId.get(row.userId);
    if (!sig) continue;
    sig.activeDaysLast14 = Number(row.activeDays) || 0;
    // Approximate current streak from recent activity density.
    sig.currentStreak = Math.min(sig.activeDaysLast14, sig.longestStreak || 14);
  }

  // Coaching cadence: latest session per student email.
  const cs = await db
    .select({
      email: coachingSessions.studentEmail,
      last: sql<Date | null>`MAX(${coachingSessions.createdAt})`,
    })
    .from(coachingSessions)
    .groupBy(coachingSessions.studentEmail);
  for (const row of cs) {
    if (!row.email) continue;
    const uid = idByEmail.get(row.email.toLowerCase());
    if (!uid) continue;
    const sig = byId.get(uid);
    if (sig && row.last) sig.lastCoachingAt = new Date(row.last);
  }

  // Satisfaction: average coaching rating per student.
  const cr = await db
    .select({
      userId: coachingSessionRatings.userId,
      avg: sql<number>`AVG(${coachingSessionRatings.rating})`,
    })
    .from(coachingSessionRatings)
    .groupBy(coachingSessionRatings.userId);
  for (const row of cr) {
    const sig = byId.get(row.userId);
    if (sig && row.avg != null) sig.avgCoachingRating = Number(row.avg);
  }

  // CRM enrichment: payment status, product end date, CSAT (by email).
  const crm = await db
    .select({
      email: activeStudents.email,
      paymentStatus: activeStudents.paymentStatus,
      productEndDate: activeStudents.productEndDate,
      serviceQuality: activeStudents.serviceQuality,
    })
    .from(activeStudents);
  for (const row of crm) {
    if (!row.email) continue;
    const uid = idByEmail.get(row.email.toLowerCase());
    if (!uid) continue;
    const sig = byId.get(uid);
    if (!sig) continue;
    sig.paymentStatus = row.paymentStatus ?? null;
    sig.productEndDate = row.productEndDate ? new Date(row.productEndDate) : null;
    // serviceQuality is stored on a ~1-5 scale in the CRM export.
    if (row.serviceQuality != null) sig.satisfactionRating = Number(row.serviceQuality);
  }

  return byId;
}

/** Load signals for a single customer (Customer 360). */
export async function loadCustomerSignals(
  userId: string,
): Promise<CustomerSignals | null> {
  const all = await loadAllCustomerSignals();
  return all.get(userId) ?? null;
}
