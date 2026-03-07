import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";

/**
 * GET /api/admin/lessons/[lessonId]
 * Get a single lesson.
 * Requires admin role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { lessonId } = await params;

    const [lesson] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    return NextResponse.json(
      { error: "Failed to fetch lesson" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/lessons/[lessonId]
 * Update lesson fields (partial update supported).
 * Requires admin role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { lessonId } = await params;
    const body = await request.json();

    // Check lesson exists
    const [existing] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      title: string;
      description: string | null;
      content: string | null;
      muxPlaybackId: string | null;
      muxAssetId: string | null;
      durationSeconds: number | null;
      sortOrder: number;
    }> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 1) {
        return NextResponse.json(
          { error: "Title is required" },
          { status: 400 }
        );
      }
      updateData.title = body.title.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }
    if (body.content !== undefined) {
      updateData.content = body.content?.trim() || null;
    }
    if (body.muxPlaybackId !== undefined) {
      updateData.muxPlaybackId = body.muxPlaybackId?.trim() || null;
    }
    if (body.muxAssetId !== undefined) {
      updateData.muxAssetId = body.muxAssetId?.trim() || null;
    }
    if (body.durationSeconds !== undefined) {
      updateData.durationSeconds = body.durationSeconds
        ? Number(body.durationSeconds)
        : null;
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = Number(body.sortOrder);
    }

    const [updatedLesson] = await db
      .update(lessons)
      .set(updateData)
      .where(eq(lessons.id, lessonId))
      .returning();

    return NextResponse.json({ lesson: updatedLesson });
  } catch (error) {
    console.error("Error updating lesson:", error);
    return NextResponse.json(
      { error: "Failed to update lesson" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/lessons/[lessonId]
 * Soft delete a lesson by setting deletedAt.
 * Requires admin role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { lessonId } = await params;

    // Check lesson exists
    const [existing] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Soft delete
    await db
      .update(lessons)
      .set({ deletedAt: new Date() })
      .where(eq(lessons.id, lessonId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    return NextResponse.json(
      { error: "Failed to delete lesson" },
      { status: 500 }
    );
  }
}
