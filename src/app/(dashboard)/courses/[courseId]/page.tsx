import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  users,
  courses,
  modules,
  lessons,
  lessonProgress,
  practiceSetAssignments,
  practiceSets,
  practiceExercises,
  practiceAttempts,
} from "@/db/schema";
import { eq, and, isNull, asc, inArray, sql, max } from "drizzle-orm";
import { ChevronLeft, ClipboardList } from "lucide-react";
import { ModuleSection } from "@/components/course/ModuleSection";
import { LessonCard } from "@/components/course/LessonCard";

import { ErrorAlert } from "@/components/ui/error-alert";
import { PracticeSetCard } from "@/components/practice/assignments/PracticeSetCard";
import { resolvePermissions } from "@/lib/permissions";
import { hasMinimumRole } from "@/lib/auth";
import { userHasLtoStudentTag } from "@/lib/tag-feature-access";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

/**
 * Course detail page - displays modules and lessons with lock/unlock states.
 */
export default async function CourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;

  // 1. Auth check
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
  }

  // 2. Get internal user ID
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) {
    redirect("/sign-in");
  }

  // 3. Verify user has valid access to this course (via resolver or coach bypass)
  const isCoachOrAbove = await hasMinimumRole("coach");
  let accessTier: "preview" | "full" = "full";

  if (!isCoachOrAbove) {
    // Classic LTO students don't get regular courses — send them to Accelerator
    if (await userHasLtoStudentTag(user.id)) {
      redirect("/dashboard/accelerator");
    }
    const permissions = await resolvePermissions(user.id);
    if (!permissions.canAccessCourse(courseId)) {
      redirect("/courses");
    }
    accessTier = permissions.getAccessTier(courseId) ?? "preview";
  }

  try {
    // 4. Fetch course with modules and lessons
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
      with: {
        modules: {
          where: isNull(modules.deletedAt),
          orderBy: [asc(modules.sortOrder)],
          with: {
            lessons: {
              where: isNull(lessons.deletedAt),
              orderBy: [asc(lessons.sortOrder)],
            },
          },
        },
      },
    });

    if (!course) {
      notFound();
    }

    // 5. Batch fetch progress for all lessons (avoid N+1)
    const allLessonIds = course.modules.flatMap((m) =>
      m.lessons.map((l) => l.id)
    );

    let progressMap = new Map<
      string,
      { completedAt: Date | null; videoWatchedPercent: number }
    >();
    const lessonQuizzesMap = new Map<string, {
      assignmentId: string;
      practiceSetId: string;
      title: string;
      score?: number | null;
    }[]>();

    if (allLessonIds.length > 0) {
      // Fetch progress
      const progressRecords = await db.query.lessonProgress.findMany({
        where: and(
          eq(lessonProgress.userId, user.id),
          inArray(lessonProgress.lessonId, allLessonIds)
        ),
        columns: {
          lessonId: true,
          completedAt: true,
          videoWatchedPercent: true,
        },
      });
      progressMap = new Map(
        progressRecords.map((p) => [
          p.lessonId,
          { completedAt: p.completedAt, videoWatchedPercent: p.videoWatchedPercent },
        ])
      );

      // Fetch lesson-level practice sets (quizzes)
      try {
        const lessonAssignments = await db
          .select({
            assignmentId: practiceSetAssignments.id,
            practiceSetId: practiceSetAssignments.practiceSetId,
            title: practiceSets.title,
            lessonId: practiceSetAssignments.targetId,
          })
          .from(practiceSetAssignments)
          .innerJoin(
            practiceSets,
            eq(practiceSetAssignments.practiceSetId, practiceSets.id)
          )
          .where(
            and(
              eq(practiceSetAssignments.targetType, "lesson"),
              inArray(practiceSetAssignments.targetId, allLessonIds),
              eq(practiceSets.status, "published"),
              isNull(practiceSets.deletedAt)
            )
          );

        // Fetch best scores for these quizzes
        const practiceSetIds = lessonAssignments.map(a => a.practiceSetId);
        let scoresMap = new Map<string, number>();
        
        if (practiceSetIds.length > 0) {
          const attempts = await db
            .select({
              practiceSetId: practiceAttempts.practiceSetId,
              bestScore: max(practiceAttempts.score),
            })
            .from(practiceAttempts)
            .where(
              and(
                eq(practiceAttempts.userId, user.id),
                inArray(practiceAttempts.practiceSetId, practiceSetIds)
              )
            )
            .groupBy(practiceAttempts.practiceSetId);
            
          scoresMap = new Map(attempts.map(a => [a.practiceSetId, a.bestScore as number]));
        }

        for (const assign of lessonAssignments) {
          const list = lessonQuizzesMap.get(assign.lessonId) || [];
          list.push({
            assignmentId: assign.assignmentId,
            practiceSetId: assign.practiceSetId,
            title: assign.title,
            score: scoresMap.get(assign.practiceSetId) ?? null,
          });
          lessonQuizzesMap.set(assign.lessonId, list);
        }
      } catch (err) {
        console.error("Failed to load lesson quizzes:", err);
      }
    }

    // 6. Compute unlock status for each lesson
    const lessonStatuses = new Map<
      string,
      { isUnlocked: boolean; isCompleted: boolean; previousTitle?: string }
    >();

    for (const mod of course.modules) {
      for (let i = 0; i < mod.lessons.length; i++) {
        const lesson = mod.lessons[i];
        const progress = progressMap.get(lesson.id);
        const isCompleted = progress?.completedAt != null;

        let isUnlocked = true;
        let previousTitle: string | undefined;

        if (i > 0) {
          const prevLesson = mod.lessons[i - 1];
          const prevProgress = progressMap.get(prevLesson.id);
          isUnlocked = prevProgress?.completedAt != null;
          if (!isUnlocked) {
            previousTitle = prevLesson.title;
          }
        }

        lessonStatuses.set(lesson.id, { isUnlocked, isCompleted, previousTitle });
      }
    }

    // 7. Fetch practice sets assigned to this course (non-blocking)
    let coursePracticeSets: Array<{
      assignmentId: string;
      practiceSetId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      exerciseCount: number;
    }> = [];

    try {
      const courseAssignments = await db
        .select({
          assignmentId: practiceSetAssignments.id,
          practiceSetId: practiceSetAssignments.practiceSetId,
          title: practiceSets.title,
          description: practiceSets.description,
          dueDate: practiceSetAssignments.dueDate,
        })
        .from(practiceSetAssignments)
        .innerJoin(
          practiceSets,
          eq(practiceSetAssignments.practiceSetId, practiceSets.id)
        )
        .where(
          and(
            eq(practiceSetAssignments.targetType, "course"),
            eq(practiceSetAssignments.targetId, courseId),
            eq(practiceSets.status, "published"),
            isNull(practiceSets.deletedAt)
          )
        );

      if (courseAssignments.length > 0) {
        const setIds = courseAssignments.map((a) => a.practiceSetId);
        const exerciseCounts = await db
          .select({
            practiceSetId: practiceExercises.practiceSetId,
            count: sql<number>`COUNT(*)`.as("count"),
          })
          .from(practiceExercises)
          .where(
            and(
              inArray(practiceExercises.practiceSetId, setIds),
              isNull(practiceExercises.deletedAt)
            )
          )
          .groupBy(practiceExercises.practiceSetId);

        const countMap = new Map(
          exerciseCounts.map((c) => [c.practiceSetId, c.count])
        );

        coursePracticeSets = courseAssignments.map((a) => ({
          ...a,
          exerciseCount: countMap.get(a.practiceSetId) ?? 0,
        }));
      }
    } catch (err) {
      console.error("Failed to load course practice sets:", err);
    }

    return (
      <div className="container mx-auto px-4 py-8">
          {/* Back link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>

          <header className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">{course.title}</h1>
            {course.description && (
              <p className="text-zinc-400">{course.description}</p>
            )}
          </header>

          {/* Modules and lessons */}
          {course.modules.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-500">No modules available yet.</p>
            </div>
          ) : (
            <div data-testid="lessons-list" className="space-y-8">
              {course.modules.map((mod) => (
                <ModuleSection key={mod.id} module={mod}>
                  {mod.lessons.length === 0 ? (
                    <p className="text-zinc-500 text-sm">
                      No lessons in this module yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {mod.lessons.map((lesson) => {
                        const status = lessonStatuses.get(lesson.id)!;
                        return (
                          <LessonCard
                            key={lesson.id}
                            lesson={lesson}
                            isUnlocked={status.isUnlocked}
                            isCompleted={status.isCompleted}
                            previousLessonTitle={status.previousTitle}
                            quizzes={lessonQuizzesMap.get(lesson.id) || []}
                          />
                        );
                      })}
                    </div>
                  )}
                </ModuleSection>
              ))}
            </div>
          )}

          {/* Practice Sets assigned to this course */}
          {coursePracticeSets.length > 0 && (
            <div className="mt-8 pt-8 border-t border-zinc-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <ClipboardList className="h-5 w-5 text-emerald-400" />
                Course Practice Sets
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {coursePracticeSets.map((ps) => (
                  <PracticeSetCard
                    key={ps.assignmentId}
                    practiceSetId={ps.practiceSetId}
                    title={ps.title}
                    description={ps.description}
                    dueDate={ps.dueDate}
                    exerciseCount={ps.exerciseCount}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
    );
  } catch (error) {
    console.error("Course detail failed to load:", error);
    return (
      <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Link>

        <ErrorAlert
          variant="block"
          message="Unable to load course details. Please try refreshing the page."
        />
      </div>
    );
  }
}
