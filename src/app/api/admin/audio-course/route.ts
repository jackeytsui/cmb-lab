import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules, tagContentGrants } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

type AudioSeriesMeta = {
  audioCourse: true;
  summary?: string;
  helloAudioSeriesUrl?: string;
  spotifyUrl?: string;
  youtubeMusicUrl?: string;
  applePodcastUrl?: string;
  studentInstructions?: string;
  allowedTagIds?: string[];
  allowedUserIds?: string[];
  extraPack?: boolean;
};

function parseAudioSeriesMeta(raw: string | null): AudioSeriesMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AudioSeriesMeta>;
    if (parsed.audioCourse !== true) return null;
    return {
      audioCourse: true,
      summary: parsed.summary ?? "",
      helloAudioSeriesUrl: parsed.helloAudioSeriesUrl ?? "",
      spotifyUrl: parsed.spotifyUrl ?? "",
      youtubeMusicUrl: parsed.youtubeMusicUrl ?? "",
      applePodcastUrl: parsed.applePodcastUrl ?? "",
      studentInstructions: parsed.studentInstructions ?? "",
      allowedTagIds: Array.isArray(parsed.allowedTagIds) ? parsed.allowedTagIds : [],
      allowedUserIds: Array.isArray(parsed.allowedUserIds) ? parsed.allowedUserIds : [],
      extraPack: parsed.extraPack === true,
    };
  } catch {
    return null;
  }
}

function parseLessonContent(raw: string | null): { audioUrl: string; transcript: string } {
  if (!raw) return { audioUrl: "", transcript: "" };
  try {
    const parsed = JSON.parse(raw) as { audioUrl?: string; transcript?: string };
    return {
      audioUrl: typeof parsed.audioUrl === "string" ? parsed.audioUrl : "",
      transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
    };
  } catch {
    return { audioUrl: "", transcript: "" };
  }
}

function stringifySeriesMeta(input: Omit<AudioSeriesMeta, "audioCourse">): string {
  return JSON.stringify({
    audioCourse: true,
    summary: input.summary?.trim() ?? "",
    helloAudioSeriesUrl: input.helloAudioSeriesUrl?.trim() ?? "",
    spotifyUrl: input.spotifyUrl?.trim() ?? "",
    youtubeMusicUrl: input.youtubeMusicUrl?.trim() ?? "",
    applePodcastUrl: input.applePodcastUrl?.trim() ?? "",
    studentInstructions: input.studentInstructions?.trim() ?? "",
    allowedTagIds: input.allowedTagIds ?? [],
    allowedUserIds: input.allowedUserIds ?? [],
    extraPack: input.extraPack ?? false,
  });
}

export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseRows = await db
    .select()
    .from(courses)
    .where(isNull(courses.deletedAt))
    .orderBy(asc(courses.sortOrder), asc(courses.createdAt));

  const audioCourses = courseRows.filter((course) =>
    Boolean(parseAudioSeriesMeta(course.description)),
  );

  const courseIds = audioCourses.map((course) => course.id);
  const moduleRows =
    courseIds.length > 0
      ? await db
          .select()
          .from(modules)
          .where(and(inArray(modules.courseId, courseIds), isNull(modules.deletedAt)))
          .orderBy(asc(modules.sortOrder), asc(modules.createdAt))
      : [];
  const moduleIds = moduleRows.map((moduleRow) => moduleRow.id);
  const lessonRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
          .orderBy(asc(lessons.sortOrder), asc(lessons.createdAt))
      : [];

  const moduleByCourseId = new Map<string, (typeof moduleRows)[number][]>();
  for (const moduleRow of moduleRows) {
    const list = moduleByCourseId.get(moduleRow.courseId) ?? [];
    list.push(moduleRow);
    moduleByCourseId.set(moduleRow.courseId, list);
  }

  const lessonByModuleId = new Map<string, (typeof lessonRows)[number][]>();
  for (const lesson of lessonRows) {
    const list = lessonByModuleId.get(lesson.moduleId) ?? [];
    list.push(lesson);
    lessonByModuleId.set(lesson.moduleId, list);
  }

  const series = audioCourses.map((course) => {
    const meta = parseAudioSeriesMeta(course.description);
    const courseModules = moduleByCourseId.get(course.id) ?? [];
    const mainModule = courseModules[0] ?? null;
    const moduleLessons = mainModule ? lessonByModuleId.get(mainModule.id) ?? [] : [];
    return {
      id: course.id,
      title: course.title,
      isPublished: course.isPublished,
      sortOrder: course.sortOrder,
      summary: meta?.summary ?? "",
      helloAudioSeriesUrl: meta?.helloAudioSeriesUrl ?? "",
      spotifyUrl: meta?.spotifyUrl ?? "",
      youtubeMusicUrl: meta?.youtubeMusicUrl ?? "",
      applePodcastUrl: meta?.applePodcastUrl ?? "",
      studentInstructions: meta?.studentInstructions ?? "",
      allowedTagIds: meta?.allowedTagIds ?? [],
      allowedUserIds: meta?.allowedUserIds ?? [],
      extraPack: meta?.extraPack ?? false,
      moduleId: mainModule?.id ?? null,
      lessons: moduleLessons.map((lesson) => {
        const lc = parseLessonContent(lesson.content);
        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description ?? "",
          durationMinutes: lesson.durationSeconds ? Math.ceil(lesson.durationSeconds / 60) : null,
          audioUrl: lc.audioUrl,
          transcript: lc.transcript,
          sortOrder: lesson.sortOrder,
        };
      }),
    };
  });

  return NextResponse.json({ series });
}

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    summary?: string;
    helloAudioSeriesUrl?: string;
    spotifyUrl?: string;
    youtubeMusicUrl?: string;
    applePodcastUrl?: string;
    studentInstructions?: string;
    allowedTagIds?: string[];
    allowedUserIds?: string[];
    extraPack?: boolean;
  };

  const title = body.title?.trim() ?? "";
  if (title.length < 3) {
    return NextResponse.json({ error: "Series title must be at least 3 characters" }, { status: 400 });
  }

  const [maxOrder] = await db
    .select({ sortOrder: courses.sortOrder })
    .from(courses)
    .where(isNull(courses.deletedAt))
    .orderBy(desc(courses.sortOrder));

  const [course] = await db
    .insert(courses)
    .values({
      title,
      description: stringifySeriesMeta({
        summary: body.summary ?? "",
        helloAudioSeriesUrl: body.helloAudioSeriesUrl ?? "",
        spotifyUrl: body.spotifyUrl ?? "",
        youtubeMusicUrl: body.youtubeMusicUrl ?? "",
        applePodcastUrl: body.applePodcastUrl ?? "",
        studentInstructions: body.studentInstructions ?? "",
        allowedTagIds: body.allowedTagIds ?? [],
        allowedUserIds: body.allowedUserIds ?? [],
        extraPack: body.extraPack ?? false,
      }),
      isPublished: false,
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      previewLessonCount: 0,
    })
    .returning();

  const [mainModule] = await db
    .insert(modules)
    .values({
      courseId: course.id,
      title: "Series Content",
      description: "Audio lesson list",
      sortOrder: 0,
    })
    .returning();

  // Sync tag_content_grants for tag-based access
  const tagIds: string[] = body.allowedTagIds ?? [];
  if (tagIds.length > 0) {
    await db.insert(tagContentGrants).values(
      tagIds.map((tagId) => ({
        tagId,
        contentType: "audio_series",
        contentId: course.id,
      })),
    );
  }

  return NextResponse.json({
    series: {
      id: course.id,
      title: course.title,
      summary: body.summary ?? "",
      helloAudioSeriesUrl: body.helloAudioSeriesUrl ?? "",
      spotifyUrl: body.spotifyUrl ?? "",
      youtubeMusicUrl: body.youtubeMusicUrl ?? "",
      applePodcastUrl: body.applePodcastUrl ?? "",
      studentInstructions: body.studentInstructions ?? "",
      allowedTagIds: body.allowedTagIds ?? [],
      allowedUserIds: body.allowedUserIds ?? [],
      moduleId: mainModule.id,
      lessons: [],
      isPublished: false,
    },
  });
}

/**
 * PATCH /api/admin/audio-course
 * Reorder audio series. Body: { order: [{ id: string, sortOrder: number }] }
 */
export async function PATCH(request: Request) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { order } = body as { order?: Array<{ id: string; sortOrder: number }> };

  if (!order || !Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  try {
    await Promise.all(
      order.map((item) =>
        db.update(courses).set({ sortOrder: item.sortOrder }).where(eq(courses.id, item.id))
      )
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder series:", error);
    return NextResponse.json({ error: "Failed to reorder" }, { status: 500 });
  }
}
