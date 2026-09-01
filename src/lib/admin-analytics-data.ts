import "server-only";

import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  courseAccess,
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
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
import {
  SYSTEM_PROGRESS_BATCH_MINIMUM,
  aggregateCompletionRows,
  isCustomizedAnalyticsCourse,
  type CompletionRowInput,
} from "@/lib/admin-analytics-model";

type StudentActivityRow = {
  userId: string;
  name: string | null;
  email: string | null;
  lastActivity: string | null;
  activeInPeriod: boolean;
  totalLessonsCompleted: number;
};

function periodCountExpression(
  column: typeof lessonProgress.lastAccessedAt,
  from: Date | null,
  to: Date | null
) {
  if (from && to) {
    return sql<number>`COUNT(CASE WHEN ${column} >= ${from} AND ${column} <= ${to} THEN 1 END)`;
  }
  if (from) {
    return sql<number>`COUNT(CASE WHEN ${column} >= ${from} THEN 1 END)`;
  }
  if (to) {
    return sql<number>`COUNT(CASE WHEN ${column} <= ${to} THEN 1 END)`;
  }
  return sql<number>`COUNT(${column})`;
}

async function loadStudentActivityData(
  from: Date | null,
  to: Date | null
): Promise<StudentActivityRow[]> {
  let legacyCompletedExpr;
  let libraryCompletedExpr;
  if (from && to) {
    legacyCompletedExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
    libraryCompletedExpr = sql<number>`COUNT(CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL AND ${courseLibraryLessonProgress.completedAt} >= ${from} AND ${courseLibraryLessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else if (from) {
    legacyCompletedExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} THEN 1 END)`;
    libraryCompletedExpr = sql<number>`COUNT(CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL AND ${courseLibraryLessonProgress.completedAt} >= ${from} THEN 1 END)`;
  } else if (to) {
    legacyCompletedExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
    libraryCompletedExpr = sql<number>`COUNT(CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL AND ${courseLibraryLessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else {
    legacyCompletedExpr = sql<number>`COUNT(${lessonProgress.completedAt})`;
    libraryCompletedExpr = sql<number>`COUNT(${courseLibraryLessonProgress.completedAt})`;
  }

  const libraryActivityMinute = sql<Date>`date_trunc('minute', ${courseLibraryLessonProgress.updatedAt})`;
  const [
    studentRows,
    legacyRows,
    libraryRows,
    libraryActivityRows,
    featureRows,
  ] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.role, "student"),
          isNull(users.deletedAt),
          excludeWhitelistedUsersSql(users.id)
        )
      ),
    db
      .select({
        userId: lessonProgress.userId,
        lastActivity: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`,
        activeCount: periodCountExpression(
          lessonProgress.lastAccessedAt,
          from,
          to
        ),
        completedCount: legacyCompletedExpr,
      })
      .from(lessonProgress)
      .groupBy(lessonProgress.userId),
    db
      .select({
        userId: courseLibraryLessonProgress.userId,
        completedCount: libraryCompletedExpr,
      })
      .from(courseLibraryLessonProgress)
      .groupBy(courseLibraryLessonProgress.userId),
    db
      .select({
        userId: courseLibraryLessonProgress.userId,
        activityMinute: libraryActivityMinute,
        recordCount: sql<number>`COUNT(*)`,
      })
      .from(courseLibraryLessonProgress)
      .groupBy(courseLibraryLessonProgress.userId, libraryActivityMinute)
      .having(sql`COUNT(*) < ${SYSTEM_PROGRESS_BATCH_MINIMUM}`),
    db
      .select({
        userId: featureEngagementEvents.userId,
        lastActivity: sql<Date | null>`MAX(${featureEngagementEvents.createdAt})`,
        activeCount:
          from && to
            ? sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.createdAt} >= ${from} AND ${featureEngagementEvents.createdAt} <= ${to} THEN 1 END)`
            : from
            ? sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.createdAt} >= ${from} THEN 1 END)`
            : to
            ? sql<number>`COUNT(CASE WHEN ${featureEngagementEvents.createdAt} <= ${to} THEN 1 END)`
            : sql<number>`COUNT(${featureEngagementEvents.createdAt})`,
      })
      .from(featureEngagementEvents)
      .groupBy(featureEngagementEvents.userId),
  ]);

  const legacyByUser = new Map(legacyRows.map((row) => [row.userId, row]));
  const libraryByUser = new Map(libraryRows.map((row) => [row.userId, row]));
  const libraryActivityByUser = new Map<
    string,
    { lastActivity: Date; activeCount: number }
  >();
  for (const row of libraryActivityRows) {
    const activityMinute = new Date(row.activityMinute);
    const existing = libraryActivityByUser.get(row.userId);
    const isInPeriod =
      (!from || activityMinute >= from) && (!to || activityMinute <= to);

    libraryActivityByUser.set(row.userId, {
      lastActivity:
        !existing || activityMinute > existing.lastActivity
          ? activityMinute
          : existing.lastActivity,
      activeCount: (existing?.activeCount ?? 0) + (isInPeriod ? 1 : 0),
    });
  }
  const featuresByUser = new Map(featureRows.map((row) => [row.userId, row]));

  return studentRows.map((student) => {
    const sources = [
      legacyByUser.get(student.id),
      libraryActivityByUser.get(student.id),
      featuresByUser.get(student.id),
    ];
    const timestamps = sources
      .map((source) => source?.lastActivity)
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());
    const lastActivity =
      timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

    return {
      userId: student.id,
      name: student.name,
      email: student.email,
      lastActivity: lastActivity?.toISOString() ?? null,
      activeInPeriod: sources.some(
        (source) => Number(source?.activeCount ?? 0) > 0
      ),
      totalLessonsCompleted:
        Number(legacyByUser.get(student.id)?.completedCount ?? 0) +
        Number(libraryByUser.get(student.id)?.completedCount ?? 0),
    };
  });
}

export async function getOverviewData(from: Date | null, to: Date | null) {
  const activityRows = await loadStudentActivityData(from, to);
  const activeStudents = activityRows.filter(
    (row) => row.activeInPeriod
  ).length;
  const inactiveStudentsNeverLoggedIn = activityRows.filter(
    (row) => !row.activeInPeriod && !row.lastActivity
  ).length;
  const inactiveStudentsLoggedInOnce = activityRows.filter(
    (row) => !row.activeInPeriod && Boolean(row.lastActivity)
  ).length;

  return {
    activeStudents,
    totalStudents: activityRows.length,
    inactiveStudentsLoggedInOnce,
    inactiveStudentsNeverLoggedIn,
  };
}

export async function getCompletionData(from: Date | null, to: Date | null) {
  const libraryCompletedExpr = to
    ? sql<number>`COUNT(DISTINCT CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL AND ${courseLibraryLessonProgress.completedAt} <= ${to} THEN ${courseLibraryLessonProgress.lessonId} END)`
    : sql<number>`COUNT(DISTINCT CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL THEN ${courseLibraryLessonProgress.lessonId} END)`;
  const libraryActivityMinute = sql<Date>`date_trunc('minute', ${courseLibraryLessonProgress.updatedAt})`;

  const legacyCompletedExpr = to
    ? sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} <= ${to} THEN ${lessonProgress.lessonId} END)`
    : sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`;
  const legacyActiveExpr =
    from && to
      ? sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.lastAccessedAt} >= ${from} AND ${lessonProgress.lastAccessedAt} <= ${to} THEN ${lessonProgress.lessonId} END)`
      : from
      ? sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.lastAccessedAt} >= ${from} THEN ${lessonProgress.lessonId} END)`
      : to
      ? sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.lastAccessedAt} <= ${to} THEN ${lessonProgress.lessonId} END)`
      : sql<number>`COUNT(DISTINCT ${lessonProgress.lessonId})`;

  const [
    validStudents,
    libraryCourses,
    libraryLessonCounts,
    libraryProgressRows,
    libraryActivityRows,
    legacyCourses,
    legacyLessonCounts,
    legacyAccessRows,
    legacyProgressRows,
  ] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "student"),
          isNull(users.deletedAt),
          excludeWhitelistedUsersSql(users.id)
        )
      ),
    db
      .select({
        id: courseLibraryCourses.id,
        title: courseLibraryCourses.title,
        allowedUserIds: courseLibraryCourses.allowedUserIds,
        systemAccessUserIds: courseLibraryCourses.systemAccessUserIds,
      })
      .from(courseLibraryCourses)
      .where(
        and(
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryCourses.deletedAt)
        )
      ),
    db
      .select({
        courseId: courseLibraryCourses.id,
        totalLessons: sql<number>`COUNT(DISTINCT ${courseLibraryLessons.id})`,
      })
      .from(courseLibraryCourses)
      .innerJoin(
        courseLibraryModules,
        and(
          eq(courseLibraryModules.courseId, courseLibraryCourses.id),
          isNull(courseLibraryModules.deletedAt)
        )
      )
      .innerJoin(
        courseLibraryLessons,
        and(
          eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
          isNull(courseLibraryLessons.deletedAt)
        )
      )
      .where(
        and(
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryCourses.deletedAt)
        )
      )
      .groupBy(courseLibraryCourses.id),
    db
      .select({
        courseId: courseLibraryCourses.id,
        userId: courseLibraryLessonProgress.userId,
        completedLessons: libraryCompletedExpr,
      })
      .from(courseLibraryLessonProgress)
      .innerJoin(
        courseLibraryLessons,
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id)
      )
      .innerJoin(
        courseLibraryModules,
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id)
      )
      .innerJoin(
        courseLibraryCourses,
        eq(courseLibraryModules.courseId, courseLibraryCourses.id)
      )
      .where(
        and(
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryCourses.deletedAt),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryLessons.deletedAt),
          ...(to ? [lte(courseLibraryLessonProgress.startedAt, to)] : [])
        )
      )
      .groupBy(courseLibraryCourses.id, courseLibraryLessonProgress.userId),
    db
      .select({
        courseId: courseLibraryCourses.id,
        userId: courseLibraryLessonProgress.userId,
        activityMinute: libraryActivityMinute,
        recordCount: sql<number>`COUNT(*)`,
      })
      .from(courseLibraryLessonProgress)
      .innerJoin(
        courseLibraryLessons,
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id)
      )
      .innerJoin(
        courseLibraryModules,
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id)
      )
      .innerJoin(
        courseLibraryCourses,
        eq(courseLibraryModules.courseId, courseLibraryCourses.id)
      )
      .where(
        and(
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryCourses.deletedAt),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryLessons.deletedAt),
          ...(from ? [gte(courseLibraryLessonProgress.updatedAt, from)] : []),
          ...(to ? [lte(courseLibraryLessonProgress.updatedAt, to)] : [])
        )
      )
      .groupBy(
        courseLibraryCourses.id,
        courseLibraryLessonProgress.userId,
        libraryActivityMinute
      )
      .having(sql`COUNT(*) < ${SYSTEM_PROGRESS_BATCH_MINIMUM}`),
    db
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true))),
    db
      .select({
        courseId: courses.id,
        totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`,
      })
      .from(courses)
      .innerJoin(
        modules,
        and(eq(modules.courseId, courses.id), isNull(modules.deletedAt))
      )
      .innerJoin(
        lessons,
        and(eq(lessons.moduleId, modules.id), isNull(lessons.deletedAt))
      )
      .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)))
      .groupBy(courses.id),
    db
      .select({ courseId: courseAccess.courseId, userId: courseAccess.userId })
      .from(courseAccess),
    db
      .select({
        courseId: courses.id,
        userId: lessonProgress.userId,
        completedLessons: legacyCompletedExpr,
        activeLessons: legacyActiveExpr,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(
        and(
          eq(courses.isPublished, true),
          isNull(courses.deletedAt),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt),
          ...(to ? [lte(lessonProgress.startedAt, to)] : [])
        )
      )
      .groupBy(courses.id, lessonProgress.userId),
  ]);

  const validStudentIds = new Set(validStudents.map((row) => row.id));
  const inputs: CompletionRowInput[] = [];
  const libraryTitleSet = new Set(
    libraryCourses.map((course) => course.title.trim().toLowerCase())
  );

  for (const course of libraryCourses) {
    const totalLessons = Number(
      libraryLessonCounts.find((row) => row.courseId === course.id)
        ?.totalLessons ?? 0
    );
    if (totalLessons === 0) continue;

    const progress = libraryProgressRows.filter(
      (row) => row.courseId === course.id && validStudentIds.has(row.userId)
    );
    const activeIds = new Set(
      libraryActivityRows
        .filter(
          (row) => row.courseId === course.id && validStudentIds.has(row.userId)
        )
        .map((row) => row.userId)
    );
    const enrolledIds = new Set(
      [...course.allowedUserIds, ...course.systemAccessUserIds].filter((id) =>
        validStudentIds.has(id)
      )
    );
    for (const row of progress) enrolledIds.add(row.userId);

    inputs.push({
      courseId: course.id,
      courseTitle: course.title,
      totalLessons,
      enrolledStudents: enrolledIds.size,
      activeStudents: activeIds.size,
      completedStudents: progress.filter(
        (row) => Number(row.completedLessons) >= totalLessons
      ).length,
      isCustomized: isCustomizedAnalyticsCourse(course.title),
    });
  }

  for (const course of legacyCourses) {
    const normalizedTitle = course.title.trim().toLowerCase();
    const isSupersededCoreCourse =
      libraryTitleSet.has(normalizedTitle) ||
      /canto to mando blueprint/i.test(course.title) ||
      /confident cantonese kickstarter/i.test(course.title);
    if (isSupersededCoreCourse) continue;

    const totalLessons = Number(
      legacyLessonCounts.find((row) => row.courseId === course.id)
        ?.totalLessons ?? 0
    );
    if (totalLessons === 0) continue;

    const progress = legacyProgressRows.filter(
      (row) => row.courseId === course.id && validStudentIds.has(row.userId)
    );
    const enrolledIds = new Set(
      legacyAccessRows
        .filter(
          (row) => row.courseId === course.id && validStudentIds.has(row.userId)
        )
        .map((row) => row.userId)
    );
    for (const row of progress) enrolledIds.add(row.userId);

    inputs.push({
      courseId: course.id,
      courseTitle: course.title,
      totalLessons,
      enrolledStudents: enrolledIds.size,
      activeStudents: progress.filter((row) => Number(row.activeLessons) > 0)
        .length,
      completedStudents: progress.filter(
        (row) => Number(row.completedLessons) >= totalLessons
      ).length,
      isCustomized: isCustomizedAnalyticsCourse(course.title),
    });
  }

  return aggregateCompletionRows(inputs);
}

export async function getDropoffData(
  from: Date | null,
  to: Date | null,
  limit: number = 20
) {
  const legacyDateConditions = [];
  if (from) legacyDateConditions.push(gte(lessonProgress.startedAt, from));
  if (to) legacyDateConditions.push(lte(lessonProgress.startedAt, to));
  const libraryDateConditions = [];
  if (from) {
    libraryDateConditions.push(
      gte(courseLibraryLessonProgress.startedAt, from)
    );
  }
  if (to) {
    libraryDateConditions.push(lte(courseLibraryLessonProgress.startedAt, to));
  }

  const [libraryResults, legacyResults] = await Promise.all([
    db
      .select({
        lessonId: courseLibraryLessons.id,
        lessonTitle: courseLibraryLessons.title,
        moduleTitle: courseLibraryModules.title,
        courseTitle: courseLibraryCourses.title,
        startedCount: sql<number>`COUNT(*)`.as("started_count"),
        completedCount:
          sql<number>`COUNT(${courseLibraryLessonProgress.completedAt})`.as(
            "completed_count"
          ),
      })
      .from(courseLibraryLessonProgress)
      .innerJoin(
        courseLibraryLessons,
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id)
      )
      .innerJoin(
        courseLibraryModules,
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id)
      )
      .innerJoin(
        courseLibraryCourses,
        eq(courseLibraryModules.courseId, courseLibraryCourses.id)
      )
      .innerJoin(users, eq(courseLibraryLessonProgress.userId, users.id))
      .where(
        and(
          eq(users.role, "student"),
          isNull(users.deletedAt),
          excludeWhitelistedUsersSql(users.id),
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryCourses.deletedAt),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryLessons.deletedAt),
          ...libraryDateConditions
        )
      )
      .groupBy(
        courseLibraryLessons.id,
        courseLibraryLessons.title,
        courseLibraryModules.title,
        courseLibraryCourses.title
      )
      .having(sql`COUNT(*) >= 3`)
      .orderBy(
        sql`(COUNT(*) - COUNT(${courseLibraryLessonProgress.completedAt}))::float / NULLIF(COUNT(*), 0) DESC`,
        sql`COUNT(*) DESC`
      )
      .limit(limit * 2),
    db
      .select({
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        moduleTitle: modules.title,
        courseTitle: courses.title,
        startedCount: sql<number>`COUNT(*)`.as("started_count"),
        completedCount: sql<number>`COUNT(${lessonProgress.completedAt})`.as(
          "completed_count"
        ),
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .innerJoin(users, eq(lessonProgress.userId, users.id))
      .where(
        and(
          eq(users.role, "student"),
          isNull(users.deletedAt),
          excludeWhitelistedUsersSql(users.id),
          isNull(lessons.deletedAt),
          isNull(modules.deletedAt),
          isNull(courses.deletedAt),
          isNotNull(lessonProgress.startedAt),
          ...legacyDateConditions
        )
      )
      .groupBy(lessons.id, lessons.title, modules.title, courses.title)
      .having(sql`COUNT(*) >= 3`)
      .orderBy(
        sql`(COUNT(*) - COUNT(${lessonProgress.completedAt}))::float / NULLIF(COUNT(*), 0) DESC`,
        sql`COUNT(*) DESC`
      )
      .limit(limit * 2),
  ]);

  return [...libraryResults, ...legacyResults]
    .map((row) => {
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
    })
    .sort((a, b) => {
      if (a.dropoffRate !== b.dropoffRate) return b.dropoffRate - a.dropoffRate;
      return b.startedCount - a.startedCount;
    })
    .slice(0, limit);
}

export async function getStudentsData(
  from: Date | null,
  to: Date | null,
  daysInactive: number = 7
) {
  const results = await loadStudentActivityData(from, to);
  const now = new Date();

  return results
    .map((row) => {
      const lastActivity = row.lastActivity ? new Date(row.lastActivity) : null;
      const daysSinceActivity = lastActivity
        ? Math.floor(
            (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
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
    })
    .filter(
      (row) =>
        row.daysSinceActivity === null || row.daysSinceActivity >= daysInactive
    )
    .sort((a, b) => {
      if (a.daysSinceActivity === null) return -1;
      if (b.daysSinceActivity === null) return 1;
      return b.daysSinceActivity - a.daysSinceActivity;
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
      interactionCount: sql<number>`COUNT(DISTINCT ${interactions.id})`.as(
        "interaction_count"
      ),
      avgAttemptsToPass:
        sql<number>`ROUND(AVG(${interactionAttempts.attemptNumber})::numeric, 1)`.as(
          "avg_attempts_to_pass"
        ),
    })
    .from(interactionAttempts)
    .innerJoin(
      interactions,
      eq(interactionAttempts.interactionId, interactions.id)
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
        ...(dateConditions.length > 0 ? dateConditions : [])
      )
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
