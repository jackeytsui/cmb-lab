import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryModules,
  courseLibraryCourses,
  courseLibraryLessonProgress,
  users,
} from "@/db/schema";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

const bodySchema = z.object({
  touch: z.boolean().optional(),
  completed: z.boolean().optional(),
});

async function getCourseLibraryUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
}

async function getLessonAccess(lessonId: string) {
  return db
    .select({
      lessonId: courseLibraryLessons.id,
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
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .limit(1);
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getCourseLibraryUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const [access] = await getLessonAccess(lessonId);
  if (!access) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const progress = await db.query.courseLibraryLessonProgress.findFirst({
    where: and(
      eq(courseLibraryLessonProgress.userId, user.id),
      eq(courseLibraryLessonProgress.lessonId, lessonId),
    ),
  });

  return NextResponse.json({
    progress: progress ?? null,
    completion: {
      isComplete: !!progress?.completedAt,
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCourseLibraryUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const [access] = await getLessonAccess(lessonId);
  if (!access) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const shouldComplete = parsed.data.completed === true;

  const [progress] = await db
    .insert(courseLibraryLessonProgress)
    .values({
      userId: user.id,
      lessonId,
      completedAt: shouldComplete ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [
        courseLibraryLessonProgress.userId,
        courseLibraryLessonProgress.lessonId,
      ],
      set: {
        ...(shouldComplete ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({
    progress,
    completion: {
      isComplete: !!progress.completedAt,
    },
  });
}
