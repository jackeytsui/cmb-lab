import "server-only";

import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  courseAccess,
  courses,
  featureEngagementEvents,
  interactionAttempts,
  interactions,
  lessonProgress,
  lessons,
  modules,
  users,
} from "@/db/schema";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

export async function getOverviewData(from: Date | null, to: Date | null) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activeThreshold = from ?? sevenDaysAgo;
  const upperBound = to ?? null;

  const totalStudentsResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        excludeWhitelistedUsersSql(users.id),
      ),
    );

  const activityRows = await db
    .select({
      userId: users.id,
      lastLesson: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`,
      lastEvent: sql<Date | null>`MAX(${featureEngagementEvents.createdAt})`,
    })
    .from(users)
    .leftJoin(lessonProgress, eq(lessonProgress.userId, users.id))
    .leftJoin(
      featureEngagementEvents,
      eq(featureEngagementEvents.userId, users.id),
    )
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        excludeWhitelistedUsersSql(users.id),
      ),
    )
    .groupBy(users.id);

  let activeStudents = 0;
  let inactiveStudentsLoggedInOnce = 0;
  let inactiveStudentsNeverLoggedIn = 0;

  for (const row of activityRows) {
    const lastLessonTs = row.lastLesson ? new Date(row.lastLesson).getTime() : 0;
    const lastEventTs = row.lastEvent ? new Date(row.lastEvent).getTime() : 0;
    const lastActivityTs = Math.max(lastLessonTs, lastEventTs);
    if (!lastActivityTs) {
      inactiveStudentsNeverLoggedIn += 1;
      continue;
    }

    const isAfterLower = lastActivityTs >= activeThreshold.getTime();
    const isBeforeUpper = upperBound
      ? lastActivityTs <= upperBound.getTime()
      : true;
    if (isAfterLower && isBeforeUpper) {
      activeStudents += 1;
    } else {
      inactiveStudentsLoggedInOnce += 1;
    }
  }

  return {
    activeStudents: Number(activeStudents),
    totalStudents: Number(totalStudentsResult[0]?.count || 0),
    inactiveStudentsLoggedInOnce: Number(inactiveStudentsLoggedInOnce),
    inactiveStudentsNeverLoggedIn: Number(inactiveStudentsNeverLoggedIn),
  };
}

export async function getCompletionData(from: Date | null, to: Date | null) {
  const publishedCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)));

  const results = [];

  for (const course of publishedCourses) {
    const lessonCountResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, course.id),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt),
        ),
      );
    const totalLessons = Number(lessonCountResult[0]?.count || 0);

    if (totalLessons === 0) continue;

    const enrolledResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${courseAccess.userId})` })
      .from(courseAccess)
      .where(eq(courseAccess.courseId, course.id));
    const enrolledStudents = Number(enrolledResult[0]?.count || 0);

    if (enrolledStudents === 0) {
      results.push({
        courseId: course.id,
        courseTitle: course.title,
        totalLessons,
        enrolledStudents: 0,
        completedStudents: 0,
        completionRate: 0,
      });
      continue;
    }

    const completionConditions = [isNotNull(lessonProgress.completedAt)];
    if (from) completionConditions.push(gte(lessonProgress.completedAt!, from));
    if (to) completionConditions.push(lte(lessonProgress.completedAt!, to));

    const completedResult = await db
      .select({
        userId: lessonProgress.userId,
        completedLessons: sql<number>`COUNT(*)`,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, course.id),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt),
          ...completionConditions,
        ),
      )
      .groupBy(lessonProgress.userId)
      .having(sql`COUNT(*) >= ${totalLessons}`);

    const completedStudents = completedResult.length;
    const completionRate =
      Math.round((completedStudents / enrolledStudents) * 1000) / 10;

    results.push({
      courseId: course.id,
      courseTitle: course.title,
      totalLessons,
      enrolledStudents,
      completedStudents,
      completionRate,
    });
  }

  results.sort((a, b) => a.completionRate - b.completionRate);
  return results;
}

export async function getDropoffData(
  from: Date | null,
  to: Date | null,
  limit: number = 20,
) {
  const dateConditions = [];
  if (from) dateConditions.push(gte(lessonProgress.startedAt, from));
  if (to) dateConditions.push(lte(lessonProgress.startedAt, to));

  const results = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      startedCount: sql<number>`COUNT(*)`.as("started_count"),
      completedCount:
        sql<number>`COUNT(${lessonProgress.completedAt})`.as("completed_count"),
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        isNotNull(lessonProgress.startedAt),
        ...(dateConditions.length > 0 ? dateConditions : []),
      ),
    )
    .groupBy(lessons.id, lessons.title, modules.title, courses.title)
    .orderBy(
      sql`(COUNT(*) - COUNT(${lessonProgress.completedAt}))::float / NULLIF(COUNT(*), 0) DESC`,
    )
    .limit(limit);

  return results.map((row) => {
    const started = Number(row.startedCount);
    const completed = Number(row.completedCount);
    const dropoffCount = started - completed;
    const dropoffRate =
      started > 0 ? Math.round((dropoffCount / started) * 1000) / 10 : 0;

    return {
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      moduleTitle: row.moduleTitle,
      courseTitle: row.courseTitle,
      startedCount: started,
      completedCount: completed,
      dropoffCount,
      dropoffRate,
    };
  });
}

export async function getStudentsData(
  from: Date | null,
  to: Date | null,
  _daysInactive: number = 7,
) {
  // Kept for API/CSV caller compatibility; sorting remains by inactivity.
  void _daysInactive;
  let completedCountExpr;
  if (from && to) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else if (from) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} THEN 1 END)`;
  } else if (to) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN 1 END)`;
  }

  const results = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      lastActivity: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`.as(
        "last_activity",
      ),
      totalLessonsCompleted: completedCountExpr.as("total_lessons_completed"),
    })
    .from(users)
    .leftJoin(lessonProgress, eq(lessonProgress.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        excludeWhitelistedUsersSql(users.id),
      ),
    )
    .groupBy(users.id, users.name, users.email)
    .orderBy(sql`MAX(${lessonProgress.lastAccessedAt}) ASC NULLS FIRST`);

  const now = new Date();

  return results.map((row) => {
    const lastActivity = row.lastActivity ? new Date(row.lastActivity) : null;
    const daysSinceActivity = lastActivity
      ? Math.floor(
          (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      lastActivity: lastActivity?.toISOString() || null,
      daysSinceActivity,
      totalLessonsCompleted: Number(row.totalLessonsCompleted),
    };
  });
}

export async function getDifficultyData(from: Date | null, to: Date | null) {
  const dateConditions = [];
  if (from) dateConditions.push(gte(interactionAttempts.createdAt, from));
  if (to) dateConditions.push(lte(interactionAttempts.createdAt, to));

  const results = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      interactionCount:
        sql<number>`COUNT(DISTINCT ${interactions.id})`.as("interaction_count"),
      avgAttemptsToPass:
        sql<number>`ROUND(AVG(${interactionAttempts.attemptNumber})::numeric, 1)`.as(
          "avg_attempts_to_pass",
        ),
    })
    .from(interactionAttempts)
    .innerJoin(
      interactions,
      eq(interactionAttempts.interactionId, interactions.id),
    )
    .innerJoin(lessons, eq(interactions.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        eq(interactionAttempts.isCorrect, true),
        isNull(interactions.deletedAt),
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        ...(dateConditions.length > 0 ? dateConditions : []),
      ),
    )
    .groupBy(lessons.id, lessons.title, modules.title, courses.title)
    .orderBy(sql`AVG(${interactionAttempts.attemptNumber}) DESC`);

  return results.map((row) => ({
    lessonId: row.lessonId,
    lessonTitle: row.lessonTitle,
    moduleTitle: row.moduleTitle,
    courseTitle: row.courseTitle,
    interactionCount: Number(row.interactionCount),
    avgAttemptsToPass: Number(row.avgAttemptsToPass),
  }));
}
