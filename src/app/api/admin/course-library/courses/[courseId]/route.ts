import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  tagContentGrants,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { hasCourseContentAccess } from "@/lib/auth";
import { COURSE_LIBRARY_COURSE_CONTENT_TYPE } from "@/lib/tag-feature-access";
import { isPrivateCourseLibraryCourseTitle } from "@/lib/course-library-course-visibility";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  isPublished: z.boolean().optional(),
  status: z.enum(["draft", "preview", "published"]).optional(),
  sortOrder: z.number().int().optional(),
  // Tag-based visibility is available only for the preset catalogue.
  allowedTagIds: z.array(z.string().uuid()).optional(),
  // All non-preset courses are private and require one of these direct grants.
  allowedUserIds: z.array(z.string().uuid()).optional(),
});

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

/**
 * GET /api/admin/course-library/courses/[courseId]
 * Returns the course with all its modules + lessons (for the editor page).
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasCourseContentAccess();
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;

  const [course] = await db
    .select()
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

  const modules = await db
    .select()
    .from(courseLibraryModules)
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .orderBy(asc(courseLibraryModules.sortOrder));

  const moduleIds = modules.map((m) => m.id);
  const lessons =
    moduleIds.length > 0
      ? await db
          .select()
          .from(courseLibraryLessons)
          .where(
            and(
              inArray(courseLibraryLessons.moduleId, moduleIds),
              isNull(courseLibraryLessons.deletedAt),
            ),
          )
          .orderBy(asc(courseLibraryLessons.sortOrder))
      : [];

  const lessonsByModule = new Map<string, typeof lessons>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l);
    lessonsByModule.set(l.moduleId, list);
  }

  const grantRows = await db
    .select({ tagId: tagContentGrants.tagId })
    .from(tagContentGrants)
    .where(
      and(
        eq(tagContentGrants.contentType, COURSE_LIBRARY_COURSE_CONTENT_TYPE),
        eq(tagContentGrants.contentId, courseId),
      ),
    );

  return NextResponse.json({
    course,
    allowedTagIds: grantRows.map((g) => g.tagId),
    modules: modules.map((m) => ({
      ...m,
      lessons: lessonsByModule.get(m.id) ?? [],
    })),
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasCourseContentAccess();
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Keep `status` (source of truth for visibility) and the legacy
  // `isPublished` boolean in sync.
  const { allowedTagIds, ...data } = parsed.data;
  if (data.status !== undefined) {
    data.isPublished = data.status === "published";
  } else if (data.isPublished !== undefined) {
    data.status = data.isPublished ? "published" : "draft";
  }

  let updated;
  if (Object.keys(data).length > 0) {
    [updated] = await db
      .update(courseLibraryCourses)
      .set(data)
      .where(
        and(
          eq(courseLibraryCourses.id, courseId),
          isNull(courseLibraryCourses.deletedAt),
        ),
      )
      .returning();
  } else {
    [updated] = await db
      .select()
      .from(courseLibraryCourses)
      .where(
        and(
          eq(courseLibraryCourses.id, courseId),
          isNull(courseLibraryCourses.deletedAt),
        ),
      )
      .limit(1);
  }

  if (!updated) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Private courses never accept tag grants. Their only learner entitlement is
  // an explicit student assignment stored in allowedUserIds.
  const isPrivateCourse = isPrivateCourseLibraryCourseTitle(updated.title);
  const shouldSyncTagGrants =
    allowedTagIds !== undefined ||
    (data.title !== undefined && isPrivateCourse);
  if (shouldSyncTagGrants) {
    const effectiveAllowedTagIds = isPrivateCourse
      ? []
      : (allowedTagIds ?? []);
    await db
      .delete(tagContentGrants)
      .where(
        and(
          eq(tagContentGrants.contentType, COURSE_LIBRARY_COURSE_CONTENT_TYPE),
          eq(tagContentGrants.contentId, courseId),
        ),
      );
    if (effectiveAllowedTagIds.length > 0) {
      await db.insert(tagContentGrants).values(
        effectiveAllowedTagIds.map((tagId) => ({
          tagId,
          contentType: COURSE_LIBRARY_COURSE_CONTENT_TYPE,
          contentId: courseId,
        })),
      );
    }
  }

  return NextResponse.json({ course: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasCourseContentAccess();
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;

  const [deleted] = await db
    .update(courseLibraryCourses)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .returning({ id: courseLibraryCourses.id });

  if (!deleted) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
