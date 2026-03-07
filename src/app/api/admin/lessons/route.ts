import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessons, modules } from "@/db/schema";
import { eq, isNull, asc, and } from "drizzle-orm";

/**
 * GET /api/admin/lessons
 * List lessons for a moduleId (query param), ordered by sortOrder.
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get("moduleId");

    if (!moduleId) {
      return NextResponse.json(
        { error: "moduleId query parameter is required" },
        { status: 400 }
      );
    }

    const lessonList = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.sortOrder));

    return NextResponse.json({ lessons: lessonList });
  } catch (error) {
    console.error("Error fetching lessons:", error);
    return NextResponse.json(
      { error: "Failed to fetch lessons" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/lessons
 * Create a new lesson.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      moduleId,
      title,
      description,
      content,
      muxPlaybackId,
      muxAssetId,
      durationSeconds,
      sortOrder,
    } = body;

    // Validate required fields
    if (!moduleId) {
      return NextResponse.json(
        { error: "moduleId is required" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || title.trim().length < 1) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Verify module exists
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Get max sortOrder if not provided
    let orderValue = sortOrder;
    if (orderValue === undefined || orderValue === null) {
      const maxOrder = await db
        .select({ max: lessons.sortOrder })
        .from(lessons)
        .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)));
      orderValue = (maxOrder[0]?.max ?? -1) + 1;
    }

    const [newLesson] = await db
      .insert(lessons)
      .values({
        moduleId,
        title: title.trim(),
        description: description?.trim() || null,
        content: content?.trim() || null,
        muxPlaybackId: muxPlaybackId?.trim() || null,
        muxAssetId: muxAssetId?.trim() || null,
        durationSeconds: durationSeconds ? Number(durationSeconds) : null,
        sortOrder: orderValue,
      })
      .returning();

    return NextResponse.json({ lesson: newLesson }, { status: 201 });
  } catch (error) {
    console.error("Error creating lesson:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 }
    );
  }
}
