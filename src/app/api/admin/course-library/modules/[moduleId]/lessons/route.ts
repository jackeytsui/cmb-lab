import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons, courseLibraryModules } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  lessonType: z.enum(["video", "text", "quiz", "download"]),
  content: z.record(z.string(), z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ moduleId: string }>;
}

/**
 * POST /api/admin/course-library/modules/[moduleId]/lessons
 * Create a new lesson inside a module. Content may be empty initially;
 * the admin fills it in via the lesson editor form.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  // Verify module exists
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Provide a sane default content shape per type
  const defaultContent: Record<string, Record<string, unknown>> = {
    video: { videoUrl: "", description: "" },
    text: { body: "" },
    quiz: { passingScore: 70, questions: [] },
    download: { fileUrl: "", fileName: "", sizeBytes: 0 },
  };

  // Next sort order
  const siblings = await db
    .select({ sortOrder: courseLibraryLessons.sortOrder })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.moduleId, moduleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    );
  const nextSort =
    siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0;

  const [lesson] = await db
    .insert(courseLibraryLessons)
    .values({
      moduleId,
      title: parsed.data.title,
      lessonType: parsed.data.lessonType,
      content: parsed.data.content ?? defaultContent[parsed.data.lessonType],
      sortOrder: nextSort,
    })
    .returning();

  return NextResponse.json({ lesson }, { status: 201 });
}
