import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryCourses, courseLibraryModules } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
});

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

/**
 * POST /api/admin/course-library/courses/[courseId]/modules
 * Create a new module inside a course.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;

  // Verify course exists
  const [course] = await db
    .select({ id: courseLibraryCourses.id })
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Next sort order = max + 1 among non-deleted sibling modules
  const siblings = await db
    .select({ sortOrder: courseLibraryModules.sortOrder })
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    );
  const nextSort =
    siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0;

  const [mod] = await db
    .insert(courseLibraryModules)
    .values({
      courseId,
      title: parsed.data.title,
      sortOrder: nextSort,
    })
    .returning();

  return NextResponse.json({ module: mod }, { status: 201 });
}
