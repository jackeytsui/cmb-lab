import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons, courseLibraryModules } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const reorderSchema = z.object({
  lessons: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
    }),
  ).min(1),
});

interface RouteParams {
  params: Promise<{ moduleId: string }>;
}

/**
 * POST /api/admin/course-library/modules/[moduleId]/lessons/reorder
 * Batch-update sortOrder for lessons within a module.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod] = await db
    .select({ id: courseLibraryModules.id })
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .limit(1);
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lessonIds = parsed.data.lessons.map((l) => l.id);

  // Verify all lessons belong to this module
  const existing = await db
    .select({ id: courseLibraryLessons.id })
    .from(courseLibraryLessons)
    .where(
      and(
        inArray(courseLibraryLessons.id, lessonIds),
        eq(courseLibraryLessons.moduleId, moduleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    );

  if (existing.length !== lessonIds.length) {
    return NextResponse.json(
      { error: "One or more lessons not found in this module" },
      { status: 400 },
    );
  }

  // Update each lesson's sortOrder
  await Promise.all(
    parsed.data.lessons.map(({ id, sortOrder }) =>
      db
        .update(courseLibraryLessons)
        .set({ sortOrder })
        .where(eq(courseLibraryLessons.id, id)),
    ),
  );

  return NextResponse.json({ success: true });
}
