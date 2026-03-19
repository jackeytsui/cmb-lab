import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courses, lessons, modules, users, studentTags } from "@/db/schema";
import { and, asc, inArray, isNull, eq } from "drizzle-orm";

/**
 * GET /api/audio-courses
 * Returns published audio courses for authenticated students.
 * Filters by series visibility (tags / specific users). Empty = visible to all.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up the DB user and their tags for visibility filtering
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userTagRows = await db
    .select({ tagId: studentTags.tagId })
    .from(studentTags)
    .where(eq(studentTags.userId, dbUser.id));
  const userTagIds = new Set(userTagRows.map((r) => r.tagId));

  const courseRows = await db
    .select()
    .from(courses)
    .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)))
    .orderBy(asc(courses.sortOrder), asc(courses.createdAt));

  // Filter to audio courses only
  const audioCourses = courseRows.filter((course) => {
    try {
      const meta = JSON.parse(course.description ?? "{}");
      return meta.audioCourse === true;
    } catch {
      return false;
    }
  });

  // Filter by visibility — admins/coaches see everything
  const isStaff = dbUser.role === "admin" || dbUser.role === "coach";
  const visibleCourses = isStaff
    ? audioCourses
    : audioCourses.filter((course) => {
        try {
          const meta = JSON.parse(course.description ?? "{}");
          const tagIds: string[] = Array.isArray(meta.allowedTagIds) ? meta.allowedTagIds : [];
          const userIds: string[] = Array.isArray(meta.allowedUserIds) ? meta.allowedUserIds : [];
          // Empty lists = visible to all
          if (tagIds.length === 0 && userIds.length === 0) return true;
          // Check if user is in allowed users
          if (userIds.includes(dbUser.id)) return true;
          // Check if user has any of the allowed tags
          if (tagIds.some((tid) => userTagIds.has(tid))) return true;
          return false;
        } catch {
          return true;
        }
      });

  if (visibleCourses.length === 0) {
    return NextResponse.json({ courses: [] });
  }

  const courseIds = visibleCourses.map((c) => c.id);
  const moduleRows = await db
    .select()
    .from(modules)
    .where(and(inArray(modules.courseId, courseIds), isNull(modules.deletedAt)))
    .orderBy(asc(modules.sortOrder));

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
          .orderBy(asc(lessons.sortOrder), asc(lessons.createdAt))
      : [];

  const moduleByCourseId = new Map<string, (typeof moduleRows)[number][]>();
  for (const m of moduleRows) {
    const list = moduleByCourseId.get(m.courseId) ?? [];
    list.push(m);
    moduleByCourseId.set(m.courseId, list);
  }

  const lessonByModuleId = new Map<string, (typeof lessonRows)[number][]>();
  for (const l of lessonRows) {
    const list = lessonByModuleId.get(l.moduleId) ?? [];
    list.push(l);
    lessonByModuleId.set(l.moduleId, list);
  }

  const result = visibleCourses.map((course) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(course.description ?? "{}");
    } catch {
      // no-op
    }

    const courseModules = moduleByCourseId.get(course.id) ?? [];
    const mainModule = courseModules[0] ?? null;
    const moduleLessons = mainModule
      ? lessonByModuleId.get(mainModule.id) ?? []
      : [];

    return {
      id: course.id,
      title: course.title,
      summary: (meta.summary as string) ?? "",
      spotifyUrl: (meta.spotifyUrl as string) ?? "",
      youtubeMusicUrl: (meta.youtubeMusicUrl as string) ?? "",
      applePodcastUrl: (meta.applePodcastUrl as string) ?? "",
      helloAudioSeriesUrl: (meta.helloAudioSeriesUrl as string) ?? "",
      studentInstructions: (meta.studentInstructions as string) ?? "",
      lessons: moduleLessons.map((lesson) => {
        let audioUrl = "";
        try {
          const content = JSON.parse(lesson.content ?? "{}");
          audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
        } catch {
          // no-op
        }
        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description ?? "",
          audioUrl,
          durationMinutes: lesson.durationSeconds
            ? Math.ceil(lesson.durationSeconds / 60)
            : null,
          sortOrder: lesson.sortOrder,
        };
      }),
    };
  });

  return NextResponse.json({ courses: result });
}
