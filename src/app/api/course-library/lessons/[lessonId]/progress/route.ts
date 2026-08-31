import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courseLibraryLessonProgress,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";
import { hasDefaultCourseCompletion } from "@/lib/staff-course-progress";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

const bodySchema = z.object({
  touch: z.boolean().optional(),
  completed: z.boolean().optional(),
});

async function getCourseLibraryUser() {
  return getCurrentUser();
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getCourseLibraryUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!(await canUserAccessCourseLibraryLesson(user, lessonId))) {
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
      isComplete: hasDefaultCourseCompletion(user.role) || !!progress?.completedAt,
    },
    completedByDefault: hasDefaultCourseCompletion(user.role),
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCourseLibraryUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!(await canUserAccessCourseLibraryLesson(user, lessonId))) {
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

  // Staff completion is virtual. Opening or marking a lesson must not create
  // fabricated progress records (or learner milestones) for a staff account.
  if (hasDefaultCourseCompletion(user.role)) {
    return NextResponse.json({
      progress: null,
      completion: { isComplete: true },
      completedByDefault: true,
    });
  }

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
