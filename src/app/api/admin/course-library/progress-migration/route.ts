import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { db, getNeonSql } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COURSE_TITLES = {
  Foundations: "The Canto to Mando Blueprint - Foundations",
  Intermediate: "The Canto to Mando Blueprint - Intermediate",
  Advanced: "The Canto to Mando Blueprint - Advanced",
} as const;

type CourseLevel = keyof typeof COURSE_TITLES;

interface ProgressRecord {
  studentId: string;
  email: string;
  contactId: string;
  course: CourseLevel;
  modules: Array<{ title: string; percent: number }>;
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isProgressRecord(value: unknown): value is ProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ProgressRecord>;
  return (
    typeof record.studentId === "string" &&
    UUID_PATTERN.test(record.studentId) &&
    typeof record.email === "string" &&
    typeof record.contactId === "string" &&
    typeof record.course === "string" &&
    record.course in COURSE_TITLES &&
    Array.isArray(record.modules) &&
    record.modules.every(
      (module) =>
        module &&
        typeof module.title === "string" &&
        Number.isInteger(module.percent) &&
        module.percent >= 0 &&
        module.percent <= 100,
    )
  );
}

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    apply?: boolean;
    records?: unknown[];
  };
  const apply = body.apply === true;
  const records = body.records ?? [];

  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    records.length > 500 ||
    !records.every(isProgressRecord)
  ) {
    return NextResponse.json(
      { error: "Invalid migration payload" },
      { status: 400 },
    );
  }

  const targetTitles = Object.values(COURSE_TITLES);
  const structure = await db
    .select({
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
      allowedUserIds: courseLibraryCourses.allowedUserIds,
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      lessonId: courseLibraryLessons.id,
    })
    .from(courseLibraryCourses)
    .innerJoin(
      courseLibraryModules,
      and(
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .innerJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .where(
      and(
        inArray(courseLibraryCourses.title, targetTitles),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      asc(courseLibraryModules.sortOrder),
      asc(courseLibraryLessons.sortOrder),
    );

  const courses = new Map<
    CourseLevel,
    {
      id: string;
      allowedUserIds: Set<string>;
      moduleList: Array<{ id: string; title: string; lessonIds: string[] }>;
      modules: Map<string, { id: string; title: string; lessonIds: string[] }>;
    }
  >();

  for (const level of Object.keys(COURSE_TITLES) as CourseLevel[]) {
    const rows = structure.filter(
      (row) => row.courseTitle === COURSE_TITLES[level],
    );
    if (!rows.length) continue;
    const modules = new Map<
      string,
      { id: string; title: string; lessonIds: string[] }
    >();
    for (const row of rows) {
      const key = normalizeTitle(row.moduleTitle);
      const courseModule = modules.get(key) ?? {
        id: row.moduleId,
        title: row.moduleTitle,
        lessonIds: [],
      };
      courseModule.lessonIds.push(row.lessonId);
      modules.set(key, courseModule);
    }
    courses.set(level, {
      id: rows[0].courseId,
      allowedUserIds: new Set(rows[0].allowedUserIds ?? []),
      moduleList: [...modules.values()],
      modules,
    });
  }

  function resolveModules(
    level: CourseLevel,
    course: NonNullable<ReturnType<typeof courses.get>>,
    sourceTitle: string,
  ) {
    const exact = course.modules.get(normalizeTitle(sourceTitle));
    if (exact) return [exact];

    const aliases: Record<CourseLevel, Record<string, [number, number]>> = {
      Foundations: {
        [normalizeTitle("Chapter 4: Basic Mandarin I")]: [3, 14],
        [normalizeTitle("Chapter 5: Basic Mandarin II")]: [15, 22],
        [normalizeTitle("Chapter 6: Basic Mandarin III")]: [23, 31],
      },
      Intermediate: {
        [normalizeTitle("Chapter 6.5 - A 'CHANGE' Before Intermediate")]: [0, 2],
        [normalizeTitle("Chapter 7: Intermediate Mandarin I")]: [3, 10],
        [normalizeTitle("Chapter 8: Intermediate Mandarin II")]: [11, 18],
        [normalizeTitle("Chapter 9: Intermediate III")]: [19, 28],
      },
      Advanced: {
        [normalizeTitle("Chapter 10: Advanced I")]: [0, 8],
        [normalizeTitle("Chapter 11: Advanced II")]: [9, 16],
        [normalizeTitle("Chapter 12: Advanced III")]: [17, 21],
      },
    };
    const range = aliases[level][normalizeTitle(sourceTitle)];
    return range ? course.moduleList.slice(range[0], range[1] + 1) : [];
  }

  const accessPairs = new Map<string, { courseId: string; userId: string }>();
  const completionPairs = new Map<
    string,
    { userId: string; lessonId: string }
  >();
  const unresolvedModules: Array<{
    email: string;
    course: CourseLevel;
    module: string;
    percent: number;
    reason: "partial" | "unmatched";
  }> = [];
  const invalidRecords: Array<{
    email: string;
    course: CourseLevel;
    reason: "no-recognized-modules";
  }> = [];

  for (const record of records) {
    const course = courses.get(record.course);
    if (!course) {
      return NextResponse.json(
        { error: `CMB course not found: ${record.course}` },
        { status: 409 },
      );
    }
    const resolved = record.modules.map((sourceModule) => ({
      sourceModule,
      courseModules: resolveModules(record.course, course, sourceModule.title),
    }));
    if (!resolved.some((entry) => entry.courseModules.length > 0)) {
      invalidRecords.push({
        email: record.email,
        course: record.course,
        reason: "no-recognized-modules",
      });
      continue;
    }

    accessPairs.set(`${course.id}:${record.studentId}`, {
      courseId: course.id,
      userId: record.studentId,
    });

    for (const { sourceModule, courseModules } of resolved) {
      if (!courseModules.length) {
        unresolvedModules.push({
          email: record.email,
          course: record.course,
          module: sourceModule.title,
          percent: sourceModule.percent,
          reason: "unmatched",
        });
        continue;
      }
      if (sourceModule.percent !== 100) {
        if (sourceModule.percent > 0) {
          unresolvedModules.push({
            email: record.email,
            course: record.course,
            module: sourceModule.title,
            percent: sourceModule.percent,
            reason: "partial",
          });
        }
        continue;
      }
      for (const courseModule of courseModules) {
        for (const lessonId of courseModule.lessonIds) {
          completionPairs.set(`${record.studentId}:${lessonId}`, {
            userId: record.studentId,
            lessonId,
          });
        }
      }
    }
  }

  const accessToAdd = [...accessPairs.values()].filter((pair) => {
    const course = [...courses.values()].find(
      (candidate) => candidate.id === pair.courseId,
    );
    return !course?.allowedUserIds.has(pair.userId);
  });
  const completionCandidates = [...completionPairs.values()];
  const existingProgress = completionCandidates.length
    ? await db
        .select({
          userId: courseLibraryLessonProgress.userId,
          lessonId: courseLibraryLessonProgress.lessonId,
          completedAt: courseLibraryLessonProgress.completedAt,
        })
        .from(courseLibraryLessonProgress)
        .where(
          inArray(
            courseLibraryLessonProgress.userId,
            [...new Set(completionCandidates.map((pair) => pair.userId))],
          ),
        )
    : [];
  const completedKeys = new Set(
    existingProgress
      .filter((row) => row.completedAt)
      .map((row) => `${row.userId}:${row.lessonId}`),
  );
  const completionsToAdd = completionCandidates.filter(
    (pair) => !completedKeys.has(`${pair.userId}:${pair.lessonId}`),
  );

  if (apply) {
    const sql = getNeonSql();
    const accessByCourse = new Map<string, string[]>();
    for (const pair of accessToAdd) {
      const userIds = accessByCourse.get(pair.courseId) ?? [];
      userIds.push(pair.userId);
      accessByCourse.set(pair.courseId, userIds);
    }
    for (const [courseId, userIds] of accessByCourse) {
      await sql`
        UPDATE course_library_courses
        SET allowed_user_ids = (
          SELECT COALESCE(jsonb_agg(user_id), '[]'::jsonb)
          FROM (
            SELECT DISTINCT user_id
            FROM jsonb_array_elements_text(
              COALESCE(allowed_user_ids, '[]'::jsonb) ||
              ${JSON.stringify(userIds)}::jsonb
            ) AS ids(user_id)
          ) AS unique_ids
        ),
        updated_at = NOW()
        WHERE id = ${courseId}::uuid
      `;
    }

    if (completionsToAdd.length) {
      const completionRows = completionsToAdd.map((pair) => ({
        user_id: pair.userId,
        lesson_id: pair.lessonId,
      }));
      await sql`
        WITH migration_rows AS (
          SELECT user_id, lesson_id
          FROM jsonb_to_recordset(${JSON.stringify(completionRows)}::jsonb)
            AS rows(user_id uuid, lesson_id uuid)
        )
        INSERT INTO course_library_lesson_progress
          (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
        SELECT user_id, lesson_id, NOW(), 0, NOW(), NOW()
        FROM migration_rows
        ON CONFLICT (user_id, lesson_id) DO UPDATE
        SET completed_at = COALESCE(
          course_library_lesson_progress.completed_at,
          EXCLUDED.completed_at
        ),
        updated_at = NOW()
      `;
    }
  }

  return NextResponse.json({
    mode: apply ? "applied" : "dry-run",
    sourceRecords: records.length,
    students: new Set([...accessPairs.values()].map((pair) => pair.userId)).size,
    accessGrants: {
      candidates: accessPairs.size,
      toAdd: accessToAdd.length,
    },
    completions: {
      candidates: completionCandidates.length,
      toAdd: completionsToAdd.length,
      alreadyComplete: completionCandidates.length - completionsToAdd.length,
    },
    unresolvedModules,
    invalidRecords,
  });
}
