import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { modules, courses } from "@/db/schema";
import { eq, isNull, asc, and } from "drizzle-orm";

/**
 * GET /api/admin/modules
 * List modules for a courseId (query param), ordered by sortOrder.
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { error: "courseId query parameter is required" },
        { status: 400 }
      );
    }

    const moduleList = await db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)))
      .orderBy(asc(modules.sortOrder));

    return NextResponse.json({ modules: moduleList });
  } catch (error) {
    console.error("Error fetching modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/modules
 * Create a new module.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { courseId, title, description, sortOrder } = body;

    // Validate required fields
    if (!courseId) {
      return NextResponse.json(
        { error: "courseId is required" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || title.trim().length < 1) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    // Verify course exists
    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Get max sortOrder if not provided
    let orderValue = sortOrder;
    if (orderValue === undefined || orderValue === null) {
      const maxOrder = await db
        .select({ max: modules.sortOrder })
        .from(modules)
        .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)));
      orderValue = (maxOrder[0]?.max ?? -1) + 1;
    }

    const [newModule] = await db
      .insert(modules)
      .values({
        courseId,
        title: title.trim(),
        description: description?.trim() || null,
        sortOrder: orderValue,
      })
      .returning();

    return NextResponse.json({ module: newModule }, { status: 201 });
  } catch (error) {
    console.error("Error creating module:", error);
    return NextResponse.json(
      { error: "Failed to create module" },
      { status: 500 }
    );
  }
}
