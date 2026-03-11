import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  coachingSessionRatings,
  coachingSessions,
  users,
} from "@/db/schema";
import { eq, avg, count, desc, sql } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/admin/analytics/coaching-ratings
 * Returns average rating per coach and per session type, with trends.
 * Requires admin role.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Average rating per coach
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
    .groupBy(coachingSessions.createdBy, users.name, users.email)
    .orderBy(desc(avg(coachingSessionRatings.rating)));

  // Average rating per session type
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
    .groupBy(coachingSessions.type);

  // Monthly trends (last 6 months)
  const trends = await db
    .select({
      month: sql<string>`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
      avgRating: avg(coachingSessionRatings.rating),
      totalRatings: count(coachingSessionRatings.id),
    })
    .from(coachingSessionRatings)
    .where(
      sql`${coachingSessionRatings.createdAt} >= now() - interval '6 months'`,
    )
    .groupBy(
      sql`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
    )
    .orderBy(
      sql`to_char(${coachingSessionRatings.createdAt}, 'YYYY-MM')`,
    );

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
  });
}
