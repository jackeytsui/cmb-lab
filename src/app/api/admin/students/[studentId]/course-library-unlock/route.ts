import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, getNeonSql } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
  users,
} from "@/db/schema";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { planManualChapterUnlock } from "@/lib/course-library-manual-unlock";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

const paramsSchema = z.object({ studentId: z.string().uuid() });
const unlockSchema = z.object({
  courseId: z.string().uuid(),
  targetModuleId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

type UnlockModule = {
  id: string;
  title: string;
  shortTitle: string | null;
  lessonIds: string[];
  completedLessonIds: string[];
};

type UnlockCourse = {
  id: string;
  title: string;
  modules: UnlockModule[];
};

function canManageProgress(role: string) {
  return role === "admin" || role === "coach";
}

function publicCourse(course: UnlockCourse) {
  const completedLessons = course.modules.reduce(
    (total, module) => total + module.completedLessonIds.length,
    0,
  );
  const totalLessons = course.modules.reduce(
    (total, module) => total + module.lessonIds.length,
    0,
  );
  const currentModuleId =
    course.modules.find(
      (module) =>
        module.lessonIds.length > 0 &&
        module.completedLessonIds.length < module.lessonIds.length,
    )?.id ?? null;

  return {
    id: course.id,
    title: course.title,
    completedLessons,
    totalLessons,
    currentModuleId,
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      shortTitle: module.shortTitle,
      lessonCount: module.lessonIds.length,
      completedLessons: module.completedLessonIds.length,
      isComplete:
        module.lessonIds.length > 0 &&
        module.completedLessonIds.length === module.lessonIds.length,
      isCurrent: module.id === currentModuleId,
    })),
  };
}

async function getStudent(studentId: string) {
  return db.query.users.findFirst({
    where: and(eq(users.id, studentId), isNull(users.deletedAt)),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      assignedCoachId: true,
    },
  });
}

async function loadUnlockCourses(student: {
  id: string;
  role: string;
}): Promise<UnlockCourse[]> {
  const canAccessCourse = await getCourseLibraryCourseAccess(student);
  const rows = await db
    .select({
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      moduleShortTitle: courseLibraryModules.shortTitle,
      lessonId: courseLibraryLessons.id,
      completedAt: courseLibraryLessonProgress.completedAt,
    })
    .from(courseLibraryCourses)
    .innerJoin(
      courseLibraryModules,
      and(
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .leftJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .leftJoin(
      courseLibraryLessonProgress,
      and(
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
        eq(courseLibraryLessonProgress.userId, student.id),
      ),
    )
    .where(
      and(
        eq(courseLibraryCourses.status, "published"),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      asc(courseLibraryCourses.title),
      asc(courseLibraryModules.sortOrder),
      asc(courseLibraryModules.title),
      asc(courseLibraryLessons.sortOrder),
      asc(courseLibraryLessons.title),
    );

  const courseMap = new Map<string, UnlockCourse>();

  for (const row of rows) {
    if (!canAccessCourse(row.courseId)) continue;

    let course = courseMap.get(row.courseId);
    if (!course) {
      course = { id: row.courseId, title: row.courseTitle, modules: [] };
      courseMap.set(row.courseId, course);
    }

    let chapter = course.modules.find((item) => item.id === row.moduleId);
    if (!chapter) {
      chapter = {
        id: row.moduleId,
        title: row.moduleTitle,
        shortTitle: row.moduleShortTitle,
        lessonIds: [],
        completedLessonIds: [],
      };
      course.modules.push(chapter);
    }

    if (!row.lessonId) continue;
    chapter.lessonIds.push(row.lessonId);
    if (row.completedAt) chapter.completedLessonIds.push(row.lessonId);
  }

  return Array.from(courseMap.values());
}

async function authorizeManager() {
  const realActor = await getRealUser();
  if (!realActor) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      actor: null,
      realActor: null,
    };
  }
  const actor =
    realActor.role === "admin"
      ? (await getCurrentUser()) ?? realActor
      : realActor;
  if (!canManageProgress(actor.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      actor: null,
      realActor: null,
    };
  }
  return { error: null, actor, realActor };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authorization = await authorizeManager();
  if (authorization.error || !authorization.actor) return authorization.error;

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid student ID" }, { status: 400 });
  }

  const student = await getStudent(parsedParams.data.studentId);
  if (
    !student ||
    student.role !== "student" ||
    !canStaffAccessStudent({
      actorUserId: authorization.actor.id,
      actorRole: authorization.actor.role,
      assignedCoachId: student.assignedCoachId,
    })
  ) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  try {
    const courses = await loadUnlockCourses(student);
    return NextResponse.json({
      student: { id: student.id, name: student.name, email: student.email },
      courses: courses.map(publicCourse),
    });
  } catch (error) {
    console.error("Failed to load Course Library unlock data:", error);
    return NextResponse.json(
      { error: "Failed to load Course Library progress" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeManager();
  if (authorization.error || !authorization.actor) return authorization.error;

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid student ID" }, { status: 400 });
  }

  const parsedBody = unlockSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Select a valid course and chapter" },
      { status: 400 },
    );
  }

  const student = await getStudent(parsedParams.data.studentId);
  if (
    !student ||
    student.role !== "student" ||
    !canStaffAccessStudent({
      actorUserId: authorization.actor.id,
      actorRole: authorization.actor.role,
      assignedCoachId: student.assignedCoachId,
    })
  ) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  try {
    const courses = await loadUnlockCourses(student);
    const course = courses.find((item) => item.id === parsedBody.data.courseId);
    if (!course) {
      return NextResponse.json(
        { error: "Student does not have access to this published course" },
        { status: 403 },
      );
    }

    const targetModule = course.modules.find(
      (module) => module.id === parsedBody.data.targetModuleId,
    );
    if (!targetModule) {
      return NextResponse.json(
        { error: "Chapter does not belong to the selected course" },
        { status: 400 },
      );
    }
    if (targetModule.lessonIds.length === 0) {
      return NextResponse.json(
        { error: "The selected chapter has no lessons to unlock" },
        { status: 400 },
      );
    }
    if (
      targetModule.completedLessonIds.length === targetModule.lessonIds.length
    ) {
      return NextResponse.json(
        { error: "The selected chapter is already complete" },
        { status: 400 },
      );
    }

    const completedLessonIds = course.modules.flatMap(
      (module) => module.completedLessonIds,
    );
    const plan = planManualChapterUnlock({
      orderedModules: course.modules,
      targetModuleId: targetModule.id,
      completedLessonIds,
    });
    const completedAt = new Date();
    const actor = authorization.actor;
    const realActor = authorization.realActor;
    const auditPayload = {
      source: "staff_manual_unlock",
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      realActorUserId: realActor.id,
      realActorEmail: realActor.email,
      realActorRole: realActor.role,
      studentId: student.id,
      studentEmail: student.email,
      courseId: course.id,
      courseTitle: course.title,
      targetModuleId: targetModule.id,
      targetModuleTitle: targetModule.title,
      prerequisiteModules: plan.prerequisiteModuleIds.length,
      prerequisiteLessons: plan.prerequisiteLessonIds.length,
      lessonsAlreadyComplete: plan.alreadyCompletedLessonIds.length,
      lessonsChanged: plan.missingLessonIds.length,
      performedAt: completedAt.toISOString(),
    };
    const sql = getNeonSql();

    await sql.transaction([
      sql`
        WITH progress_rows AS (
          SELECT lesson_id
          FROM jsonb_to_recordset(${JSON.stringify(
            plan.missingLessonIds.map((lessonId) => ({ lesson_id: lessonId })),
          )}::jsonb) AS rows(lesson_id uuid)
        )
        INSERT INTO course_library_lesson_progress
          (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
        SELECT ${student.id}::uuid, lesson_id, ${completedAt.toISOString()}::timestamptz,
          0, ${completedAt.toISOString()}::timestamptz, NOW()
        FROM progress_rows
        ON CONFLICT (user_id, lesson_id) DO UPDATE
        SET completed_at = COALESCE(
          course_library_lesson_progress.completed_at,
          EXCLUDED.completed_at
        ),
        updated_at = NOW()
      `,
      sql`
        INSERT INTO sync_events
          (event_type, direction, status, entity_type, entity_id, payload, processed_at)
        VALUES (
          'course_progress.manual_unlock',
          'inbound',
          'completed',
          'course_library_progress',
          ${student.id},
          ${JSON.stringify(auditPayload)}::jsonb,
          NOW()
        )
      `,
    ]);

    const refreshedCourses = await loadUnlockCourses(student);
    return NextResponse.json({
      success: true,
      result: {
        courseTitle: course.title,
        targetModuleTitle: targetModule.title,
        lessonsChanged: plan.missingLessonIds.length,
        lessonsAlreadyComplete: plan.alreadyCompletedLessonIds.length,
      },
      courses: refreshedCourses.map(publicCourse),
    });
  } catch (error) {
    console.error("Failed to unlock Course Library chapter:", error);
    return NextResponse.json(
      { error: "Failed to unlock the selected chapter" },
      { status: 500 },
    );
  }
}
