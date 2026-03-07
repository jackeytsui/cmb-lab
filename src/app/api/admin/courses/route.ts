import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, modules } from "@/db/schema";
import { isNull, asc, count } from "drizzle-orm";

/**
 * GET /api/admin/courses
 * List all courses (including unpublished), ordered by sortOrder.
 * Excludes soft-deleted courses (deletedAt IS NULL).
 * Requires admin role.
 */
export async function GET() {
  // Verify admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Get all courses with module counts
    const courseList = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        thumbnailUrl: courses.thumbnailUrl,
        isPublished: courses.isPublished,
        previewLessonCount: courses.previewLessonCount,
        sortOrder: courses.sortOrder,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
      })
      .from(courses)
      .where(isNull(courses.deletedAt))
      .orderBy(asc(courses.sortOrder));

    // Get module counts for each course
    const moduleCounts = await db
      .select({
        courseId: modules.courseId,
        count: count(),
      })
      .from(modules)
      .where(isNull(modules.deletedAt))
      .groupBy(modules.courseId);

    const moduleCountMap = new Map(
      moduleCounts.map((m) => [m.courseId, Number(m.count)])
    );

    const coursesWithCounts = courseList.map((course) => ({
      ...course,
      moduleCount: moduleCountMap.get(course.id) || 0,
    }));

    return NextResponse.json({ courses: coursesWithCounts });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/courses
 * Create a new course.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  // Verify admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, thumbnailUrl, isPublished, previewLessonCount, sortOrder } = body;

    // Validate required fields
    if (!title || typeof title !== "string" || title.trim().length < 3) {
      return NextResponse.json(
        { error: "Title is required and must be at least 3 characters" },
        { status: 400 }
      );
    }

    // Get max sortOrder if not provided
    let orderValue = sortOrder;
    if (orderValue === undefined || orderValue === null) {
      const maxOrder = await db
        .select({ max: courses.sortOrder })
        .from(courses)
        .where(isNull(courses.deletedAt));
      orderValue = (maxOrder[0]?.max ?? -1) + 1;
    }

    const [newCourse] = await db
      .insert(courses)
      .values({
        title: title.trim(),
        description: description?.trim() || null,
        thumbnailUrl: thumbnailUrl?.trim() || null,
        isPublished: isPublished ?? false,
        previewLessonCount: previewLessonCount ?? 3,
        sortOrder: orderValue,
      })
      .returning();

    return NextResponse.json({ course: newCourse }, { status: 201 });
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 }
    );
  }
}
