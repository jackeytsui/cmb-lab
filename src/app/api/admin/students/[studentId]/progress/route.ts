import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  courseAccess,
  courses,
  modules,
  lessons,
  lessonProgress,
  interactions,
} from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

interface LessonProgressData {
  id: string;
  title: string;
  videoWatchedPercent: number;
  interactionsCompleted: number;
  interactionsTotal: number;
  completedAt: string | null;
}

interface ModuleProgressData {
  id: string;
  title: string;
  lessons: LessonProgressData[];
}

interface CourseProgressData {
  id: string;
  title: string;
  progress: {
    lessonsTotal: number;
    lessonsCompleted: number;
    percentComplete: number;
  };
  modules: ModuleProgressData[];
}

/**
 * GET /api/admin/students/[studentId]/progress
 * Get detailed course/module/lesson progress for a student.
 * Requires admin role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;

  try {
    // 3. Verify student exists
    const student = await db.query.users.findFirst({
      where: eq(users.id, studentId),
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // 4. Get courses the student has access to
    const studentAccess = await db
      .select({
        courseId: courseAccess.courseId,
      })
      .from(courseAccess)
      .where(eq(courseAccess.userId, studentId));

    const courseIds = studentAccess.map((a) => a.courseId);

    if (courseIds.length === 0) {
      return NextResponse.json({ courses: [] });
    }

    // 5. Fetch course data with modules and lessons
    const coursesData = await db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        moduleId: modules.id,
        moduleTitle: modules.title,
        moduleSortOrder: modules.sortOrder,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        lessonSortOrder: lessons.sortOrder,
      })
      .from(courses)
      .innerJoin(modules, eq(modules.courseId, courses.id))
      .innerJoin(lessons, eq(lessons.moduleId, modules.id))
      .where(sql`${courses.id} IN ${courseIds}`)
      .orderBy(
        asc(courses.title),
        asc(modules.sortOrder),
        asc(lessons.sortOrder)
      );

    // 6. Fetch student's lesson progress
    const progressData = await db
      .select({
        lessonId: lessonProgress.lessonId,
        videoWatchedPercent: lessonProgress.videoWatchedPercent,
        interactionsCompleted: lessonProgress.interactionsCompleted,
        interactionsTotal: lessonProgress.interactionsTotal,
        completedAt: lessonProgress.completedAt,
      })
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, studentId));

    // Create lookup map for progress
    const progressMap = new Map(
      progressData.map((p) => [
        p.lessonId,
        {
          videoWatchedPercent: p.videoWatchedPercent,
          interactionsCompleted: p.interactionsCompleted,
          interactionsTotal: p.interactionsTotal,
          completedAt: p.completedAt?.toISOString() || null,
        },
      ])
    );

    // 7. Fetch interaction counts per lesson
    const interactionCounts = await db
      .select({
        lessonId: interactions.lessonId,
        count: sql<number>`COUNT(*)`,
      })
      .from(interactions)
      .groupBy(interactions.lessonId);

    const interactionCountMap = new Map(
      interactionCounts.map((i) => [i.lessonId, Number(i.count)])
    );

    // 8. Build nested response structure
    const courseMap = new Map<string, CourseProgressData>();

    for (const row of coursesData) {
      // Get or create course
      if (!courseMap.has(row.courseId)) {
        courseMap.set(row.courseId, {
          id: row.courseId,
          title: row.courseTitle,
          progress: {
            lessonsTotal: 0,
            lessonsCompleted: 0,
            percentComplete: 0,
          },
          modules: [],
        });
      }
      const course = courseMap.get(row.courseId)!;

      // Get or create module
      let courseModule = course.modules.find((m) => m.id === row.moduleId);
      if (!courseModule) {
        courseModule = {
          id: row.moduleId,
          title: row.moduleTitle,
          lessons: [],
        };
        course.modules.push(courseModule);
      }

      // Add lesson with progress data
      const progress = progressMap.get(row.lessonId);
      const totalInteractions = interactionCountMap.get(row.lessonId) || 0;

      courseModule.lessons.push({
        id: row.lessonId,
        title: row.lessonTitle,
        videoWatchedPercent: progress?.videoWatchedPercent || 0,
        interactionsCompleted: progress?.interactionsCompleted || 0,
        interactionsTotal: totalInteractions,
        completedAt: progress?.completedAt || null,
      });

      // Update course totals
      course.progress.lessonsTotal++;
      if (progress?.completedAt) {
        course.progress.lessonsCompleted++;
      }
    }

    // Calculate percentages
    for (const course of courseMap.values()) {
      if (course.progress.lessonsTotal > 0) {
        course.progress.percentComplete = Math.round(
          (course.progress.lessonsCompleted / course.progress.lessonsTotal) *
            100
        );
      }
    }

    return NextResponse.json({
      courses: Array.from(courseMap.values()),
    });
  } catch (error) {
    console.error("Error fetching student progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch student progress" },
      { status: 500 }
    );
  }
}
