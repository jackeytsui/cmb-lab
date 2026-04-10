import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { and, asc, desc, isNull } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().optional().nullable(),
});

/**
 * GET /api/admin/course-library/courses — list all (non-deleted) courses
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(courseLibraryCourses)
    .where(isNull(courseLibraryCourses.deletedAt))
    .orderBy(asc(courseLibraryCourses.sortOrder), desc(courseLibraryCourses.createdAt));

  return NextResponse.json({ courses: rows });
}

/**
 * POST /api/admin/course-library/courses — create a new course
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
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

  // Next sort order = max + 1
  const existing = await db
    .select()
    .from(courseLibraryCourses)
    .where(isNull(courseLibraryCourses.deletedAt));
  const nextSort =
    existing.length > 0 ? Math.max(...existing.map((c) => c.sortOrder)) + 1 : 0;

  const [course] = await db
    .insert(courseLibraryCourses)
    .values({
      title: parsed.data.title,
      summary: parsed.data.summary ?? "",
      coverImageUrl: parsed.data.coverImageUrl ?? null,
      createdBy: currentUser.id,
      sortOrder: nextSort,
    })
    .returning();

  return NextResponse.json({ course }, { status: 201 });
}
