import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { practiceSets, practiceSetAssignments, lessons } from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { PracticePlayer } from "@/components/practice/player/PracticePlayer";
import { getNextLesson } from "@/lib/unlock";
import { userHasLtoStudentTag } from "@/lib/tag-feature-access";

// ============================================================
// Types
// ============================================================

interface PageProps {
  params: Promise<{ setId: string }>;
}

// ============================================================
// Metadata
// ============================================================

export async function generateMetadata({ params }: PageProps) {
  const { setId } = await params;
  const practiceSet = await db.query.practiceSets.findFirst({
    where: and(eq(practiceSets.id, setId), isNull(practiceSets.deletedAt)),
  });
  return {
    title: practiceSet?.title ? `${practiceSet.title} - Practice` : "Practice",
  };
}

// ============================================================
// Page
// ============================================================

export default async function PracticePage({ params }: PageProps) {
  // 1. Auth check
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // 2. Get setId from params
  const { setId } = await params;

  // 2a. Classic LTO students don't get regular practice sets
  const isCoachOrAbove = await hasMinimumRole("coach");
  if (!isCoachOrAbove) {
    const ltoUser = await getCurrentUser();
    if (ltoUser && (await userHasLtoStudentTag(ltoUser.id))) {
      redirect("/dashboard/accelerator");
    }
  }

  // 3. Fetch practice set with exercises in a single query, plus user in parallel
  const [practiceSetWithExercises, dbUser] = await Promise.all([
    db.query.practiceSets.findFirst({
      where: and(eq(practiceSets.id, setId), isNull(practiceSets.deletedAt)),
      with: {
        exercises: {
          orderBy: (exercises, { asc: asc_ }) => [asc_(exercises.sortOrder)],
          where: (exercises, { isNull: isNull_ }) =>
            isNull_(exercises.deletedAt),
        },
      },
    }),
    getCurrentUser(),
  ]);

  // 4. Verify practice set exists and is published
  if (
    !practiceSetWithExercises ||
    practiceSetWithExercises.status !== "published"
  ) {
    notFound();
  }

  // 5. Check exercises exist
  const { exercises, ...practiceSet } = practiceSetWithExercises;
  if (exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="text-center text-zinc-400">
          <p className="text-lg font-medium">No exercises found</p>
          <p className="text-sm mt-1">
            This practice set does not have any exercises yet.
          </p>
        </div>
      </div>
    );
  }

  // 6. Determine Next Action (Sequential Navigation)
  let nextAction: { label: string; href: string } | undefined;

  // Find if this quiz is assigned to a lesson
  const currentAssignment = await db.query.practiceSetAssignments.findFirst({
    where: and(
      eq(practiceSetAssignments.practiceSetId, setId),
      eq(practiceSetAssignments.targetType, "lesson")
    ),
  });

  if (currentAssignment) {
    const lessonId = currentAssignment.targetId;

    // Fetch all quizzes assigned to this lesson to find the sequence
    const lessonQuizzes = await db
      .select({
        assignmentId: practiceSetAssignments.id,
        practiceSetId: practiceSetAssignments.practiceSetId,
      })
      .from(practiceSetAssignments)
      .innerJoin(
        practiceSets,
        eq(practiceSets.id, practiceSetAssignments.practiceSetId)
      )
      .where(
        and(
          eq(practiceSetAssignments.targetType, "lesson"),
          eq(practiceSetAssignments.targetId, lessonId),
          eq(practiceSets.status, "published"),
          isNull(practiceSets.deletedAt)
        )
      )
      .orderBy(asc(practiceSetAssignments.createdAt));

    const currentIndex = lessonQuizzes.findIndex(
      (q) => q.practiceSetId === setId
    );

    // If there is another quiz after this one in the same lesson
    if (currentIndex !== -1 && currentIndex < lessonQuizzes.length - 1) {
      const nextQuiz = lessonQuizzes[currentIndex + 1];
      nextAction = {
        label: "Next Quiz",
        href: `/practice/${nextQuiz.practiceSetId}`,
      };
    } else {
      // No more quizzes in this lesson, go to next lesson
      const nextLesson = await getNextLesson(lessonId);
      if (nextLesson) {
        nextAction = {
          label: "Next Lesson",
          href: `/lessons/${nextLesson.id}`,
        };
      } else {
        // End of module/course, link back to course page
        const lesson = await db.query.lessons.findFirst({
          where: eq(lessons.id, lessonId),
          with: { module: true },
        });
        if (lesson) {
          nextAction = {
            label: "Back to Course",
            href: `/courses/${lesson.module.courseId}`,
          };
        }
      }
    }
  }

  // 7. Render player
  return (
    <div className="py-8 px-4">
      <PracticePlayer
        practiceSet={practiceSet}
        exercises={exercises}
        userId={dbUser?.id ?? ""}
        nextAction={nextAction}
      />
    </div>
  );
}
