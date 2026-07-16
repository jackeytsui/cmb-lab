import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getUserContentGrants, getRestrictedContentIds } from "@/lib/tag-feature-access";
import { getCurrentUser } from "@/lib/auth";
import { isCustomizedTitle } from "@/lib/customized-content";

/**
 * GET /api/audio-courses
 * Returns published audio courses for authenticated students.
 * Filters by series visibility (tags / specific users). Empty = visible to all.
 * Uses getCurrentUser() so View As impersonation works correctly for admins.
 */
export async function GET() {
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseRows = await db
    .select()
    .from(courses)
    .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)))
    .orderBy(asc(courses.sortOrder), asc(courses.createdAt));

  // Filter to audio courses only — exclude extraPack courses because they have
  // their own dedicated page (/dashboard/accelerator-extra/audio) gated by the
  // `audio_accelerator_edition` feature.
  const audioCourses = courseRows.filter((course) => {
    try {
      const meta = JSON.parse(course.description ?? "{}");
      return meta.audioCourse === true && meta.extraPack !== true;
    } catch {
      return false;
    }
  });

  // Filter by visibility using tag_content_grants
  const isStaff = dbUser.role === "admin" || dbUser.role === "coach";
  let visibleCourses = audioCourses;

  if (!isStaff) {
    // Get which series this student has tag-based access to
    const [grantedIds, restrictedIds] = await Promise.all([
      getUserContentGrants(dbUser.id, "audio_series"),
      getRestrictedContentIds("audio_series"),
    ]);

    visibleCourses = audioCourses.filter((course) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(course.description ?? "{}");
      } catch { /* ignore */ }

      // Customized (per-student) series are ALWAYS restricted, even with no
      // grants configured — default deny; access is granted manually in the
      // audio course editor's Visibility section (or via a tag grant).
      const isCustom =
        isCustomizedTitle(course.title) || meta.customCourse === true;

      // Non-custom course with no tag restrictions → visible to all
      if (!isCustom && !restrictedIds.has(course.id)) return true;
      // Tag grant
      if (grantedIds.has(course.id)) return true;
      // Per-student manual grant (allowedUserIds from the Visibility editor)
      const userIds: string[] = Array.isArray(meta.allowedUserIds)
        ? (meta.allowedUserIds as string[])
        : [];
      return userIds.includes(dbUser.id);
    });
  }

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
        let transcript = "";
        try {
          const content = JSON.parse(lesson.content ?? "{}");
          audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
          transcript = typeof content.transcript === "string" ? content.transcript : "";
        } catch {
          // no-op
        }
        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description ?? "",
          audioUrl,
          transcript,
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
