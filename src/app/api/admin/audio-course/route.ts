import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
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
    };
  } catch {
    return null;
  }
}

function parseLessonAudioUrl(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { audioUrl?: string };
    return typeof parsed.audioUrl === "string" ? parsed.audioUrl : "";
  } catch {
    return "";
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
  });
}

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
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
      moduleId: mainModule?.id ?? null,
      lessons: moduleLessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description ?? "",
        durationMinutes: lesson.durationSeconds ? Math.ceil(lesson.durationSeconds / 60) : null,
        audioUrl: parseLessonAudioUrl(lesson.content),
        sortOrder: lesson.sortOrder,
      })),
    };
  });

  return NextResponse.json({ series });
}

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
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
