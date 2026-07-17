import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons, courseLibraryModules } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const moveSchema = z.object({
  // Final ordered lesson ids for each affected module (source + target).
  groups: z.record(z.string().uuid(), z.array(z.string().uuid())).refine(
    (g) => Object.keys(g).length >= 1,
    { message: "At least one module is required" },
  ),
});

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

/**
 * PATCH /api/admin/course-library/lessons/[lessonId]/move
 *
 * Move a lesson across modules (drag-and-drop) and persist the resulting
 * ordering of every affected module in one transaction. Scoped to a single
 * course: every module and lesson referenced must belong to the same course
 * as the dragged lesson, so a drag can never leak data across courses.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { groups } = parsed.data;
  const allLessonIds = Object.values(groups).flat();

  // The dragged lesson must appear exactly once across the groups, and no
  // lesson id may be listed twice.
  if (!allLessonIds.includes(lessonId)) {
    return NextResponse.json(
      { error: "Dragged lesson is missing from the submitted layout" },
      { status: 400 },
    );
  }
  if (new Set(allLessonIds).size !== allLessonIds.length) {
    return NextResponse.json(
      { error: "A lesson appears more than once in the layout" },
      { status: 400 },
    );
  }

  // Resolve the dragged lesson and the course it lives in.
  const [lesson] = await db
    .select({ id: courseLibraryLessons.id, moduleId: courseLibraryLessons.moduleId })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .limit(1);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const [sourceModule] = await db
    .select({ courseId: courseLibraryModules.courseId })
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.id, lesson.moduleId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .limit(1);
  if (!sourceModule) {
    return NextResponse.json({ error: "Source module not found" }, { status: 404 });
  }
  const courseId = sourceModule.courseId;

  // Every target module must belong to this course.
  const moduleIds = Object.keys(groups);
  const mods = await db
    .select({ id: courseLibraryModules.id })
    .from(courseLibraryModules)
    .where(
      and(
        inArray(courseLibraryModules.id, moduleIds),
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    );
  if (mods.length !== moduleIds.length) {
    return NextResponse.json(
      { error: "One or more modules are not part of this course" },
      { status: 400 },
    );
  }

  // Every referenced lesson must currently belong to this course.
  const lessonRows = await db
    .select({ id: courseLibraryLessons.id })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .where(
      and(
        inArray(courseLibraryLessons.id, allLessonIds),
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
      ),
    );
  if (lessonRows.length !== allLessonIds.length) {
    return NextResponse.json(
      { error: "One or more lessons are not part of this course" },
      { status: 400 },
    );
  }

  // Persist: each lesson gets its new module and its index as sortOrder.
  await db.transaction(async (tx) => {
    for (const [moduleId, ids] of Object.entries(groups)) {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(courseLibraryLessons)
          .set({ moduleId, sortOrder: i })
          .where(eq(courseLibraryLessons.id, ids[i]));
      }
    }
  });

  return NextResponse.json({ success: true });
}
