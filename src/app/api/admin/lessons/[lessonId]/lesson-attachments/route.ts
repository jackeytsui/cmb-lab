import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { eq, asc, and, isNull } from "drizzle-orm";
import { lessonAttachments, lessons } from "@/db/schema/courses";

/**
 * GET /api/admin/lessons/[lessonId]/attachments
 * List all attachments for a lesson.
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

    const attachments = await db
      .select()
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId))
      .orderBy(asc(lessonAttachments.sortOrder));

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/lessons/[lessonId]/attachments
 * Create a new attachment for a lesson.
 * Requires admin role.
 */
export async function POST(
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
    const { title, url, type } = body;

    if (!title || !url) {
      return NextResponse.json(
        { error: "Title and URL are required" },
        { status: 400 }
      );
    }

    // Verify lesson exists
    const [lesson] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Get max sortOrder
    const existingAttachments = await db
      .select({ id: lessonAttachments.id })
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId));
    
    const [attachment] = await db
      .insert(lessonAttachments)
      .values({
        lessonId,
        title: title.trim(),
        url: url.trim(),
        type: type || "link",
        sortOrder: existingAttachments.length, 
      })
      .returning();

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("Error creating attachment:", error);
    return NextResponse.json(
      { error: "Failed to create attachment" },
      { status: 500 }
    );
  }
}
