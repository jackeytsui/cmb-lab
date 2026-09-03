import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessonProgress, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    access.status !== "authorized" ||
    (access.actor.role !== "admin" && access.actor.role !== "coach")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const student = await db.query.users.findFirst({
    where: and(eq(users.id, studentId), isNull(users.deletedAt)),
    columns: { assignedCoachId: true, additionalCoachIds: true },
  });
  if (
    !student ||
    !canStaffAccessStudent({
      actorUserId: access.actor.id,
      actorRole: access.actor.role,
      assignedCoachId: student.assignedCoachId,
      additionalCoachIds: student.additionalCoachIds,
    })
  ) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  const body = await request.json();
  const { lessonId, isComplete } = body;

  if (!lessonId || typeof isComplete !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if (isComplete) {
      // Mark as complete. If record doesn't exist, create it.
      await db
        .insert(lessonProgress)
        .values({
          userId: studentId,
          lessonId,
          completedAt: new Date(),
          videoWatchedPercent: 0, // Don't assume video watched, just unlock
          interactionsCompleted: 0,
          lastAccessedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [lessonProgress.userId, lessonProgress.lessonId],
          set: { completedAt: new Date() },
        });
    } else {
      // Mark incomplete
      await db
        .update(lessonProgress)
        .set({ completedAt: null })
        .where(
          and(
            eq(lessonProgress.userId, studentId),
            eq(lessonProgress.lessonId, lessonId)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to toggle progress:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 }
    );
  }
}
