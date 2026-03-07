import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getNextLesson } from "@/lib/unlock";
import { db } from "@/db";
import { practiceSetAssignments, practiceSets } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * GET /api/lessons/[lessonId]/next
 *
 * Returns the next available activity (quiz or lesson) for CTA routing.
 * Priority:
 * 1. Quiz assigned to current lesson
 * 2. Next lesson in the module
 *
 * Response: {
 *   nextLesson: { id: string; title: string } | null,
 *   nextQuiz: { id: string; title: string } | null
 * }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonId } = await params;

    // 1. Check for quizzes assigned to THIS lesson
    const [quizAssignment] = await db
      .select({
        id: practiceSets.id,
        title: practiceSets.title,
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
      .limit(1);

    // 2. Check for next lesson
    const nextLesson = await getNextLesson(lessonId);

    return NextResponse.json({
      nextLesson,
      nextQuiz: quizAssignment || null,
    });
  } catch (error) {
    console.error("Error fetching next lesson:", error);
    return NextResponse.json(
      { error: "Failed to get next lesson" },
      { status: 500 }
    );
  }
}
