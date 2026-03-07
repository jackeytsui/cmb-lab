import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, modules, lessons } from "@/db/schema";
import { eq, isNull, asc, and } from "drizzle-orm";

/**
 * GET /api/admin/courses/[courseId]
 * Get a single course with nested modules and lessons.
 * Requires admin role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { courseId } = await params;

    // Get course
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Get modules for this course
    const moduleList = await db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)))
      .orderBy(asc(modules.sortOrder));

    // Get lessons for all modules
    const moduleIds = moduleList.map((m) => m.id);
    const lessonList =
      moduleIds.length > 0
        ? await db
            .select()
            .from(lessons)
            .where(isNull(lessons.deletedAt))
            .orderBy(asc(lessons.sortOrder))
        : [];

    // Build nested structure
    const modulesWithLessons = moduleList.map((module) => ({
      ...module,
      lessons: lessonList.filter((l) => l.moduleId === module.id),
    }));

    return NextResponse.json({
      course: {
        ...course,
        modules: modulesWithLessons,
      },
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/courses/[courseId]
 * Update course fields (partial update supported).
 * Requires admin role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { courseId } = await params;
    const body = await request.json();

    // Check course exists
    const [existing] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      title: string;
      description: string | null;
      thumbnailUrl: string | null;
      isPublished: boolean;
      previewLessonCount: number;
      sortOrder: number;
    }> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 3) {
        return NextResponse.json(
          { error: "Title must be at least 3 characters" },
          { status: 400 }
        );
      }
      updateData.title = body.title.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }
    if (body.thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = body.thumbnailUrl?.trim() || null;
    }
    if (body.isPublished !== undefined) {
      updateData.isPublished = Boolean(body.isPublished);
    }
    if (body.previewLessonCount !== undefined) {
      updateData.previewLessonCount = Number(body.previewLessonCount);
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = Number(body.sortOrder);
    }

    const [updatedCourse] = await db
      .update(courses)
      .set(updateData)
      .where(eq(courses.id, courseId))
      .returning();

    return NextResponse.json({ course: updatedCourse });
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/courses/[courseId]
 * Soft delete a course by setting deletedAt.
 * Requires admin role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { courseId } = await params;

    // Check course exists
    const [existing] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Soft delete
    await db
      .update(courses)
      .set({ deletedAt: new Date() })
      .where(eq(courses.id, courseId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 }
    );
  }
}
