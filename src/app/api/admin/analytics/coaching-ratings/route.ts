import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  coachingSessionRatings,
  coachingSessions,
  users,
} from "@/db/schema";
import { and, eq, avg, count, desc, sql, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { alias } from "drizzle-orm/pg-core";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

/**
 * GET /api/admin/analytics/coaching-ratings
 * Returns average rating per coach, per session type, trends,
 * and individual recent feedback entries.
 * Only counts feedback from students (not admins/coaches).
 * Excludes whitelisted users.
 * Requires admin or coach role.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAllowed = await hasMinimumRole("coach");
  if (!isAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Alias for the student who submitted the rating
  const ratingUser = alias(users, "ratingUser");

  // Common filter: only students, not whitelisted
  const studentOnlyFilter = and(
    eq(ratingUser.role, "student"),
    isNull(ratingUser.deletedAt),
    excludeWhitelistedUsersSql(ratingUser.id),
  );

  // Average rating per coach (only from students)
  const perCoach = await db
    .select({
      coachId: coachingSessions.createdBy,
      coachName: users.name,
      coachEmail: users.email,
      avgRating: avg(coachingSessionRatings.rating),
      totalRatings: count(coachingSessionRatings.id),
    })
    .from(coachingSessionRatings)
    .innerJoin(
      coachingSessions,
      eq(coachingSessionRatings.sessionId, coachingSessions.id),
    )
    .innerJoin(users, eq(coachingSessions.createdBy, users.id))
    .innerJoin(ratingUser, eq(coachingSessionRatings.userId, ratingUser.id))
    .where(studentOnlyFilter)
    .groupBy(coachingSessions.createdBy, users.name, users.email)
    .orderBy(desc(avg(coachingSessionRatings.rating)));

  // Average rating per session type (only from students)
  const perSessionType = await db
    .select({
      sessionType: coachingSessions.type,
      avgRating: avg(coachingSessionRatings.rating),
      totalRatings: count(coachingSessionRatings.id),
    })
    .from(coachingSessionRatings)
    .innerJoin(
      coachingSessions,
      eq(coachingSessionRatings.sessionId, coachingSessions.id),
    )
    .innerJoin(ratingUser, eq(coachingSessionRatings.userId, ratingUser.id))
    .where(studentOnlyFilter)
    .groupBy(coachingSessions.type);

  // Monthly trends (last 6 months, only from students)
  const trends = await db
    .select({
      month: sql<string>`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
      avgRating: avg(coachingSessionRatings.rating),
      totalRatings: count(coachingSessionRatings.id),
    })
    .from(coachingSessionRatings)
    .innerJoin(ratingUser, eq(coachingSessionRatings.userId, ratingUser.id))
    .where(
      and(
        studentOnlyFilter,
        sql`${coachingSessionRatings.createdAt} >= now() - interval '6 months'`,
      ),
    )
    .groupBy(
      sql`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
    )
    .orderBy(
      sql`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
    );

  // Recent individual feedback (last 50 entries, only from students)
  const studentUsers = alias(users, "studentUsers");
  const recentFeedback = await db
    .select({
      id: coachingSessionRatings.id,
      rating: coachingSessionRatings.rating,
      comment: coachingSessionRatings.comment,
      createdAt: coachingSessionRatings.createdAt,
      sessionTitle: coachingSessions.title,
      sessionType: coachingSessions.type,
      studentName: studentUsers.name,
      studentEmail: studentUsers.email,
      coachName: users.name,
    })
    .from(coachingSessionRatings)
    .innerJoin(
      coachingSessions,
      eq(coachingSessionRatings.sessionId, coachingSessions.id),
    )
    .innerJoin(studentUsers, eq(coachingSessionRatings.userId, studentUsers.id))
    .innerJoin(users, eq(coachingSessions.createdBy, users.id))
    .where(
      and(
        eq(studentUsers.role, "student"),
        isNull(studentUsers.deletedAt),
        excludeWhitelistedUsersSql(studentUsers.id),
      ),
    )
    .orderBy(desc(coachingSessionRatings.createdAt))
    .limit(50);

  return NextResponse.json({
    perCoach: perCoach.map((row) => ({
      ...row,
      avgRating: row.avgRating ? parseFloat(String(row.avgRating)) : null,
    })),
    perSessionType: perSessionType.map((row) => ({
      ...row,
      avgRating: row.avgRating ? parseFloat(String(row.avgRating)) : null,
    })),
    trends: trends.map((row) => ({
      ...row,
      avgRating: row.avgRating ? parseFloat(String(row.avgRating)) : null,
    })),
    recentFeedback: recentFeedback.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt,
      sessionTitle: row.sessionTitle,
      sessionType: row.sessionType,
      studentName: row.studentName,
      studentEmail: row.studentEmail,
      coachName: row.coachName,
    })),
  });
}
