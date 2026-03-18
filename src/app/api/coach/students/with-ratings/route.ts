import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, coachingSessions, coachingSessionRatings } from "@/db/schema";
import { and, eq, avg, count, isNull, or, ilike, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

/**
 * GET /api/coach/students/with-ratings
 * Returns students with their assigned coach info and average coaching ratings.
 *
 * Query params:
 * - coachId: filter by assigned coach (admin only, optional)
 * - search: search by name or email
 * - myStudents: "true" to show only the current user's assigned students
 *
 * Access: coach+ role required
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentDbUser = await getCurrentUser();
  if (!currentDbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const coachIdFilter = searchParams.get("coachId") || "";
  const myStudents = searchParams.get("myStudents") === "true";

  // Build where clause for students
  const conditions = [
    eq(users.role, "student"),
    isNull(users.deletedAt),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(users.email, `%${search}%`),
        ilike(users.name, `%${search}%`),
      )!,
    );
  }

  // Coach filter: either specific coach or "my students"
  if (myStudents || (coachIdFilter && coachIdFilter !== "all")) {
    const targetCoachId = myStudents ? currentDbUser.id : coachIdFilter;
    conditions.push(eq(users.assignedCoachId, targetCoachId));
  }

  // Fetch students with their assigned coach name
  const coach = alias(users, "coach");
  const studentRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      assignedCoachId: users.assignedCoachId,
      coachName: coach.name,
      coachEmail: coach.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(coach, eq(users.assignedCoachId, coach.id))
    .where(and(...conditions))
    .orderBy(coach.name, users.name);

  // Fetch average ratings for each student (1:1 and inner circle separately)
  // We need ratings where the student is the rater, grouped by session type
  const ratingRows = studentRows.length > 0
    ? await db
        .select({
          studentId: coachingSessionRatings.userId,
          sessionType: coachingSessions.type,
          avgRating: avg(coachingSessionRatings.rating),
          ratingCount: count(coachingSessionRatings.id),
        })
        .from(coachingSessionRatings)
        .innerJoin(
          coachingSessions,
          eq(coachingSessionRatings.sessionId, coachingSessions.id),
        )
        .where(
          sql`${coachingSessionRatings.userId} IN (${sql.join(
            studentRows.map((s) => sql`${s.id}`),
            sql`, `,
          )})`,
        )
        .groupBy(coachingSessionRatings.userId, coachingSessions.type)
    : [];

  // Build rating lookup map: studentId -> { one_on_one: avg, inner_circle: avg }
  const ratingMap = new Map<
    string,
    { one_on_one: number | null; inner_circle: number | null; one_on_one_count: number; inner_circle_count: number }
  >();
  for (const row of ratingRows) {
    if (!ratingMap.has(row.studentId)) {
      ratingMap.set(row.studentId, {
        one_on_one: null,
        inner_circle: null,
        one_on_one_count: 0,
        inner_circle_count: 0,
      });
    }
    const entry = ratingMap.get(row.studentId)!;
    const avg = row.avgRating ? parseFloat(String(row.avgRating)) : null;
    if (row.sessionType === "one_on_one") {
      entry.one_on_one = avg;
      entry.one_on_one_count = Number(row.ratingCount);
    } else if (row.sessionType === "inner_circle") {
      entry.inner_circle = avg;
      entry.inner_circle_count = Number(row.ratingCount);
    }
  }

  const students = studentRows.map((s) => {
    const ratings = ratingMap.get(s.id);
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      assignedCoachId: s.assignedCoachId,
      coachName: s.coachName,
      coachEmail: s.coachEmail,
      createdAt: s.createdAt,
      avgRating1on1: ratings?.one_on_one ?? null,
      avgRatingInnerCircle: ratings?.inner_circle ?? null,
      ratingCount1on1: ratings?.one_on_one_count ?? 0,
      ratingCountInnerCircle: ratings?.inner_circle_count ?? 0,
    };
  });

  return NextResponse.json({ students });
}
