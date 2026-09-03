import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { courseAccess, bulkOperations, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hasMinimumRole, getRealUser } from "@/lib/auth";
import { setStaffTagOverride } from "@/lib/staff-tag-overrides";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { syncTagToGhl } from "@/lib/ghl/tag-sync";

const undoSchema = z.object({
  operationId: z.string().uuid(),
});

/**
 * POST /api/admin/students/bulk/undo
 * Reverse a bulk operation if within the 5-minute undo window.
 * Requires coach+ role. Only the user who performed the operation can undo it.
 */
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getRealUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = undoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { operationId } = parsed.data;

  try {
    // Fetch the bulk operation record
    const [op] = await db
      .select()
      .from(bulkOperations)
      .where(
        and(
          eq(bulkOperations.id, operationId),
          eq(bulkOperations.performedBy, currentUser.id)
        )
      );

    if (!op) {
      return NextResponse.json(
        { error: "Operation not found" },
        { status: 404 }
      );
    }

    if (op.undoneAt !== null) {
      return NextResponse.json(
        { error: "Operation already undone" },
        { status: 409 }
      );
    }

    if (op.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Undo window expired (5 minutes)" },
        { status: 410 }
      );
    }

    // Reverse the operation using succeededIds only
    const succeededIds = op.succeededIds as string[];
    const targetId = op.targetId;
    let studentsAffected = 0;

    for (const studentId of succeededIds) {
      try {
        const student = await db.query.users.findFirst({
          where: and(
            eq(users.id, studentId),
            eq(users.role, "student"),
            isNull(users.deletedAt),
          ),
          columns: { assignedCoachId: true },
        });
        if (
          !student ||
          !canStaffAccessStudent({
            actorUserId: currentUser.id,
            actorRole: currentUser.role,
            assignedCoachId: student.assignedCoachId,
          })
        ) {
          continue;
        }

        switch (op.operationType) {
          case "assign_course": {
            // Reverse: remove course access
            await db
              .delete(courseAccess)
              .where(
                and(
                  eq(courseAccess.userId, studentId),
                  eq(courseAccess.courseId, targetId)
                )
              );
            studentsAffected++;
            break;
          }

          case "remove_course": {
            // Reverse: re-grant course access
            await db
              .insert(courseAccess)
              .values({
                userId: studentId,
                courseId: targetId,
                grantedBy: "coach",
              })
              .onConflictDoNothing();
            studentsAffected++;
            break;
          }

          case "add_tag": {
            // Reverse: remove tag
            const result = await setStaffTagOverride({
              userId: studentId,
              tagId: targetId,
              isAssigned: false,
              setBy: currentUser.id,
            });
            syncTagToGhl(studentId, result.tag.name, "remove").catch(
              console.error,
            );
            studentsAffected++;
            break;
          }

          case "remove_tag": {
            // Reverse: re-assign tag
            const result = await setStaffTagOverride({
              userId: studentId,
              tagId: targetId,
              isAssigned: true,
              setBy: currentUser.id,
            });
            syncTagToGhl(studentId, result.tag.name, "add").catch(console.error);
            studentsAffected++;
            break;
          }
        }
      } catch (err) {
        // Log failure but continue -- partial undo is acceptable
        console.error(
          `Failed to undo for student ${studentId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Mark the operation as undone
    await db
      .update(bulkOperations)
      .set({ undoneAt: new Date() })
      .where(eq(bulkOperations.id, operationId));

    return NextResponse.json({
      undone: true,
      operationId,
      studentsAffected,
    });
  } catch (error) {
    console.error("Undo operation error:", error);
    return NextResponse.json(
      { error: "Failed to undo operation" },
      { status: 500 }
    );
  }
}
