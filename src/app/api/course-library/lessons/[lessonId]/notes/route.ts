import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonNotes,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

const updateSchema = z.object({
  content: z.string().max(50_000),
});

async function getAccessibleVideoLesson(
  lessonId: string,
  user: { id: string; role?: string | null },
) {
  const [lesson] = await db
    .select({
      id: courseLibraryLessons.id,
      type: courseLibraryLessons.lessonType,
      courseId: courseLibraryCourses.id,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);

  if (!lesson || lesson.type !== "video") return null;
  return (await canUserAccessCourseLibraryLesson(user, lessonId))
    ? lesson
    : null;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lessonId } = await params;
  if (!(await getAccessibleVideoLesson(lessonId, user))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  const note = await db.query.courseLibraryLessonNotes.findFirst({
    where: and(
      eq(courseLibraryLessonNotes.userId, user.id),
      eq(courseLibraryLessonNotes.lessonId, lessonId),
    ),
    columns: { content: true },
  });
  return NextResponse.json({ content: note?.content ?? "" });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lessonId } = await params;
  if (!(await getAccessibleVideoLesson(lessonId, user))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  }
  await db
    .insert(courseLibraryLessonNotes)
    .values({ userId: user.id, lessonId, content: parsed.data.content })
    .onConflictDoUpdate({
      target: [
        courseLibraryLessonNotes.userId,
        courseLibraryLessonNotes.lessonId,
      ],
      set: { content: parsed.data.content, updatedAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}
