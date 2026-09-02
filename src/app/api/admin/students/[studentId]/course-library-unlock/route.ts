import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, getNeonSql } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import {
  planManualChapterUnlock,
  planManualLessonPosition,
} from "@/lib/course-library-manual-unlock";
import {
  loadStudentCourseLibraryProgress,
  type StudentCourseLibraryProgressCourse,
} from "@/lib/course-library-student-progress";

const paramsSchema = z.object({ studentId: z.string().uuid() });
const unlockSchema = z.object({
  courseId: z.string().uuid(),
  targetModuleId: z.string().uuid(),
});
const setNextLessonSchema = z.object({
  action: z.literal("set_next_lesson"),
  courseId: z.string().uuid(),
  targetLessonId: z.string().uuid(),
});
const progressMutationSchema = z.union([setNextLessonSchema, unlockSchema]);

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

type UnlockCourse = StudentCourseLibraryProgressCourse;

function canManageProgress(role: string) {
  return role === "admin" || role === "coach";
}

function publicCourse(course: UnlockCourse) {
  const completedLessons = course.modules.reduce(
    (total, module) => total + module.completedLessonIds.length,
    0
  );
  const totalLessons = course.modules.reduce(
    (total, module) => total + module.lessonIds.length,
    0
  );
  const currentModuleId =
    course.modules.find(
      (module) =>
        module.lessonIds.length > 0 &&
        module.completedLessonIds.length < module.lessonIds.length
    )?.id ?? null;
  const currentLessonId =
    course.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => !lesson.isComplete)?.id ?? null;

  return {
    id: course.id,
    title: course.title,
    hasAccess: course.hasAccess,
    completedLessons,
    totalLessons,
    currentModuleId,
    currentLessonId,
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
      lessons: module.lessons,
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

function loadUnlockCourses(student: { id: string; role: string }) {
  return loadStudentCourseLibraryProgress(student, {
    includeUnassignedPublished: true,
  });
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
      { status: 500 }
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

  const parsedBody = progressMutationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Select a valid course and progress target" },
      { status: 400 }
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
        { error: "Published course not found" },
        { status: 404 }
      );
    }

    const completedLessonIds = course.modules.flatMap(
      (module) => module.completedLessonIds
    );
    const actor = authorization.actor;
    const realActor = authorization.realActor;
    const sql = getNeonSql();
    const courseAccessGranted = !course.hasAccess;

    const accessGrantQueries = (performedAt: Date) =>
      course.hasAccess
        ? []
        : [
            sql`
              UPDATE course_library_courses
              SET allowed_user_ids = COALESCE(allowed_user_ids, '[]'::jsonb)
                || jsonb_build_array(${student.id}::text),
                updated_at = NOW()
              WHERE id = ${course.id}::uuid
                AND deleted_at IS NULL
                AND NOT COALESCE(allowed_user_ids, '[]'::jsonb)
                  @> jsonb_build_array(${student.id}::text)
            `,
            sql`
              INSERT INTO sync_events
                (event_type, direction, status, entity_type, entity_id, payload, processed_at)
              VALUES (
                'course_access.staff_grant',
                'inbound',
                'completed',
                'course_library_course_access',
                ${course.id},
                ${JSON.stringify({
                  source: "student_progress_manager",
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
                  grantType: "manual_allowed_user",
                  performedAt: performedAt.toISOString(),
                })}::jsonb,
                NOW()
              )
            `,
          ];

    if ("targetLessonId" in parsedBody.data) {
      const targetLessonId = parsedBody.data.targetLessonId;
      const targetLesson = course.modules
        .flatMap((module) =>
          module.lessons.map((lesson) => ({
            ...lesson,
            moduleId: module.id,
            moduleTitle: module.title,
          }))
        )
        .find((lesson) => lesson.id === targetLessonId);
      if (!targetLesson) {
        return NextResponse.json(
          { error: "Lesson does not belong to the selected course" },
          { status: 400 }
        );
      }

      const plan = planManualLessonPosition({
        orderedModules: course.modules,
        targetLessonId: targetLesson.id,
        completedLessonIds,
      });
      const changedAt = new Date();
      const auditPayload = {
        source: "staff_manual_lesson_position",
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
        targetModuleId: targetLesson.moduleId,
        targetModuleTitle: targetLesson.moduleTitle,
        targetLessonId: targetLesson.id,
        targetLessonTitle: targetLesson.title,
        prerequisiteLessons: plan.lessonIdsBeforeTarget.length,
        lessonsCompleted: plan.missingPrerequisiteLessonIds.length,
        lessonsReopened: plan.completedLessonIdsToReopen.length,
        courseAccessGranted,
        preservedFields: [
          "video_watched_percent",
          "quiz_score",
          "quiz_answers",
          "started_at",
          "submissions",
          "recordings",
          "notes",
        ],
        performedAt: changedAt.toISOString(),
      };

      await sql.transaction([
        ...accessGrantQueries(changedAt),
        sql`
          WITH progress_rows AS (
            SELECT lesson_id
            FROM jsonb_to_recordset(${JSON.stringify(
              plan.missingPrerequisiteLessonIds.map((lessonId) => ({
                lesson_id: lessonId,
              }))
            )}::jsonb) AS rows(lesson_id uuid)
          )
          INSERT INTO course_library_lesson_progress
            (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
          SELECT ${student.id}::uuid, lesson_id,
            ${changedAt.toISOString()}::timestamptz, 0,
            ${changedAt.toISOString()}::timestamptz, NOW()
          FROM progress_rows
          ON CONFLICT (user_id, lesson_id) DO UPDATE
          SET completed_at = COALESCE(
            course_library_lesson_progress.completed_at,
            EXCLUDED.completed_at
          ),
          updated_at = NOW()
        `,
        sql`
          WITH progress_rows AS (
            SELECT lesson_id
            FROM jsonb_to_recordset(${JSON.stringify(
              plan.completedLessonIdsToReopen.map((lessonId) => ({
                lesson_id: lessonId,
              }))
            )}::jsonb) AS rows(lesson_id uuid)
          )
          UPDATE course_library_lesson_progress AS progress
          SET completed_at = NULL, updated_at = NOW()
          FROM progress_rows
          WHERE progress.user_id = ${student.id}::uuid
            AND progress.lesson_id = progress_rows.lesson_id
            AND progress.completed_at IS NOT NULL
        `,
        sql`
          INSERT INTO sync_events
            (event_type, direction, status, entity_type, entity_id, payload, processed_at)
          VALUES (
            'course_progress.staff_reposition',
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
          action: "set_next_lesson",
          courseTitle: course.title,
          targetModuleTitle: targetLesson.moduleTitle,
          targetLessonTitle: targetLesson.title,
          lessonsCompleted: plan.missingPrerequisiteLessonIds.length,
          lessonsReopened: plan.completedLessonIdsToReopen.length,
          courseAccessGranted,
        },
        courses: refreshedCourses.map(publicCourse),
      });
    }

    const targetModuleId = parsedBody.data.targetModuleId;
    const targetModule = course.modules.find(
      (module) => module.id === targetModuleId
    );
    if (!targetModule) {
      return NextResponse.json(
        { error: "Chapter does not belong to the selected course" },
        { status: 400 }
      );
    }
    if (targetModule.lessonIds.length === 0) {
      return NextResponse.json(
        { error: "The selected chapter has no lessons to unlock" },
        { status: 400 }
      );
    }
    if (
      targetModule.completedLessonIds.length === targetModule.lessonIds.length
    ) {
      return NextResponse.json(
        { error: "The selected chapter is already complete" },
        { status: 400 }
      );
    }

    const plan = planManualChapterUnlock({
      orderedModules: course.modules,
      targetModuleId: targetModule.id,
      completedLessonIds,
    });
    const completedAt = new Date();
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
      courseAccessGranted,
      performedAt: completedAt.toISOString(),
    };

    await sql.transaction([
      ...accessGrantQueries(completedAt),
      sql`
        WITH progress_rows AS (
          SELECT lesson_id
          FROM jsonb_to_recordset(${JSON.stringify(
            plan.missingLessonIds.map((lessonId) => ({ lesson_id: lessonId }))
          )}::jsonb) AS rows(lesson_id uuid)
        )
        INSERT INTO course_library_lesson_progress
          (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
        SELECT ${
          student.id
        }::uuid, lesson_id, ${completedAt.toISOString()}::timestamptz,
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
        courseAccessGranted,
      },
      courses: refreshedCourses.map(publicCourse),
    });
  } catch (error) {
    console.error("Failed to update Course Library progress:", error);
    return NextResponse.json(
      { error: "Failed to update Course Library progress" },
      { status: 500 }
    );
  }
}
