import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { courseAccess, bulkOperations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { assignTag, removeTag } from "@/lib/tags";
import { assignRole, removeRole } from "@/lib/user-roles";

const bulkSchema = z.object({
  operation: z.enum(["assign_course", "remove_course", "add_tag", "remove_tag", "assign_role", "remove_role"]),
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  targetId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * POST /api/admin/students/bulk
 * Process bulk operations (course/tag assign/remove) per-student with individual error handling.
 * Requires coach+ role.
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

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { operation, studentIds, targetId, expiresAt } = parsed.data;

  try {
    const results: { studentId: string; success: boolean; error?: string }[] = [];

    // Process each student independently (sequential to avoid overwhelming DB)
    for (const studentId of studentIds) {
      try {
        switch (operation) {
          case "assign_course": {
            // Check if access already exists
            const existing = await db.query.courseAccess.findFirst({
              where: and(
                eq(courseAccess.userId, studentId),
                eq(courseAccess.courseId, targetId)
              ),
            });

            if (existing) {
              results.push({ studentId, success: true, error: "Already enrolled" });
            } else {
              await db.insert(courseAccess).values({
                userId: studentId,
                courseId: targetId,
                grantedBy: "coach",
              });
              results.push({ studentId, success: true });
            }
            break;
          }

          case "remove_course": {
            const deleted = await db
              .delete(courseAccess)
              .where(
                and(
                  eq(courseAccess.userId, studentId),
                  eq(courseAccess.courseId, targetId)
                )
              )
              .returning({ id: courseAccess.id });

            if (deleted.length === 0) {
              results.push({ studentId, success: false, error: "Not enrolled" });
            } else {
              results.push({ studentId, success: true });
            }
            break;
          }

          case "add_tag": {
            await assignTag(studentId, targetId, currentUser.id);
            results.push({ studentId, success: true });
            break;
          }

          case "remove_tag": {
            await removeTag(studentId, targetId);
            results.push({ studentId, success: true });
            break;
          }

          case "assign_role": {
            await assignRole(
              studentId,
              targetId,
              currentUser.id,
              expiresAt ? new Date(expiresAt) : undefined
            );
            results.push({ studentId, success: true });
            break;
          }

          case "remove_role": {
            const removed = await removeRole(studentId, targetId);
            results.push({
              studentId,
              success: removed,
              error: removed ? undefined : "Role not assigned",
            });
            break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({ studentId, success: false, error: message });
      }
    }

    // Log the operation to bulk_operations table
    const succeededIds = results.filter((r) => r.success).map((r) => r.studentId);

    const [op] = await db
      .insert(bulkOperations)
      .values({
        operationType: operation,
        targetId,
        studentIds,
        succeededIds,
        performedBy: currentUser.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      })
      .returning();

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      operationId: op.id,
      results,
      summary: {
        total: studentIds.length,
        succeeded,
        failed,
      },
    });
  } catch (error) {
    console.error("Bulk operation error:", error);
    return NextResponse.json(
      { error: "Failed to process bulk operation" },
      { status: 500 }
    );
  }
}
