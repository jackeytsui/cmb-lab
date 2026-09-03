import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { getStudentTags } from "@/lib/tags";
import { syncTagToGhl } from "@/lib/ghl/tag-sync";
import { setStaffTagOverride } from "@/lib/staff-tag-overrides";
import { z } from "zod";

const tagBodySchema = z.object({
  tagId: z.string().uuid("tagId must be a valid UUID"),
});

async function authorizeStudentTagAccess(studentId: string) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  if (access.status !== "authorized") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }

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
      actorUserId: access.actor.id,
      actorRole: access.actor.role,
      assignedCoachId: student.assignedCoachId,
    })
  ) {
    return {
      response: NextResponse.json(
        { error: "Student not found" },
        { status: 404 },
      ),
    } as const;
  }

  return { actor: access.realActor } as const;
}

/**
 * GET /api/students/[studentId]/tags
 * List all tags for a student.
 * Requires coach or administrator role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const access = await authorizeStudentTagAccess(studentId);
    if ("response" in access) return access.response;
    const studentTagsList = await getStudentTags(studentId);
    return NextResponse.json({ tags: studentTagsList });
  } catch (error) {
    console.error("Error fetching student tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch student tags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/students/[studentId]/tags
 * Assign a tag to a student.
 * Body: { tagId: string }
 * Requires coach or administrator role. Staff choices are durable overrides
 * and are not reverted by automated purchase reconciliation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const access = await authorizeStudentTagAccess(studentId);
    if ("response" in access) return access.response;
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await setStaffTagOverride({
      userId: studentId,
      tagId: parsed.data.tagId,
      isAssigned: true,
      setBy: access.actor.id,
    });

    // Reassert the explicit staff choice in GHL even if CMB Lab was already
    // in the requested state.
    syncTagToGhl(studentId, result.tag.name, "add").catch(console.error);

    return NextResponse.json(
      { assigned: true, changed: result.changed, tag: result.tag },
      { status: result.changed ? 201 : 200 }
    );
  } catch (error) {
    console.error("Error assigning tag:", error);
    const message =
      error instanceof Error ? error.message : "Failed to assign tag";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/students/[studentId]/tags
 * Remove a tag from a student.
 * Body: { tagId: string }
 * Requires coach or administrator role. Removal is also a durable override.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const access = await authorizeStudentTagAccess(studentId);
    if ("response" in access) return access.response;
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await setStaffTagOverride({
      userId: studentId,
      tagId: parsed.data.tagId,
      isAssigned: false,
      setBy: access.actor.id,
    });

    // Reassert the explicit staff choice in GHL even if CMB Lab was already
    // in the requested state.
    syncTagToGhl(studentId, result.tag.name, "remove").catch(console.error);

    return NextResponse.json({
      success: true,
      changed: result.changed,
      tag: result.tag,
    });
  } catch (error) {
    console.error("Error removing tag:", error);
    return NextResponse.json(
      { error: "Failed to remove tag" },
      { status: 500 }
    );
  }
}
