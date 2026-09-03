import { studentAssignedToCoach } from "@/lib/coach-student-sql";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, coachingSessions, coachingSessionRatings } from "@/db/schema";
import { and, eq, avg, count, isNull, or, ilike, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";
import { isStaffRole } from "@/lib/platform-roles";
import { resolveCoachStudentScope } from "@/lib/coach-student-scope";

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
  const realUser = await getRealUser();
  if (!realUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStaffRole(realUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const viewedUser = (await getCurrentUser()) ?? realUser;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const coachIdFilter = searchParams.get("coachId") || "";
  const myStudents = searchParams.get("myStudents") === "true";

  // Build where clause for students (exclude whitelisted)
  const conditions = [
    eq(users.role, "student"),
    isNull(users.deletedAt),
    excludeWhitelistedUsersSql(users.id),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(users.email, `%${search}%`),
        ilike(users.name, `%${search}%`),
      )!,
    );
  }

  const targetCoachId = resolveCoachStudentScope({
    realUserId: realUser.id,
    realRole: realUser.role,
    viewedUserId: viewedUser.id,
    viewedRole: viewedUser.role,
    myStudents,
    requestedCoachId: coachIdFilter,
  });
  if (targetCoachId) {
    conditions.push(studentAssignedToCoach(targetCoachId));
  }

  // Fetch students with their assigned coach name
  const coach = alias(users, "coach");
  const studentRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      assignedCoachId: users.assignedCoachId,
      additionalCoachIds: users.additionalCoachIds,
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

  const sharedIds = [...new Set(studentRows.flatMap((student) => student.additionalCoachIds))];
  const sharedCoaches = sharedIds.length ? await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.id, sharedIds), isNull(users.deletedAt))) : [];
  const sharedCoachNames = new Map(sharedCoaches.map((coach) => [coach.id, coach.name || coach.email]));

  const students = studentRows.map((s) => {
    const ratings = ratingMap.get(s.id);
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      assignedCoachId: s.assignedCoachId,
      coachName: s.coachName,
      coachEmail: s.coachEmail,
      additionalCoachNames: s.additionalCoachIds.filter((id) => id !== s.assignedCoachId)
        .map((id) => sharedCoachNames.get(id) ?? "Unavailable coach"),
      createdAt: s.createdAt,
      avgRating1on1: ratings?.one_on_one ?? null,
      avgRatingInnerCircle: ratings?.inner_circle ?? null,
      ratingCount1on1: ratings?.one_on_one_count ?? 0,
      ratingCountInnerCircle: ratings?.inner_circle_count ?? 0,
    };
  });

  return NextResponse.json({ students });
}
