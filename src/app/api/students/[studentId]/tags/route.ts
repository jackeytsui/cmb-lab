import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { getStudentTags, assignTag, removeTag } from "@/lib/tags";
import { syncTagToGhl } from "@/lib/ghl/tag-sync";
import { z } from "zod";

const tagBodySchema = z.object({
  tagId: z.string().uuid("tagId must be a valid UUID"),
});

/**
 * GET /api/students/[studentId]/tags
 * List all tags for a student.
 * Requires coach role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { studentId } = await params;
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
 * Requires coach role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { studentId } = await params;
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    const result = await assignTag(
      studentId,
      parsed.data.tagId,
      currentUser?.id,
      { source: "api" }
    );

    // Fire-and-forget: sync tag to GHL if this was a new assignment
    if (result.assigned) {
      syncTagToGhl(studentId, result.tag.name, "add", {
        tagType: result.tag.type,
      }).catch(console.error);
    }

    return NextResponse.json(
      { assigned: result.assigned, tag: result.tag },
      { status: result.assigned ? 201 : 200 }
    );
  } catch (error) {
    console.error("Error assigning tag:", error);
    const message = error instanceof Error ? error.message : "Failed to assign tag";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/students/[studentId]/tags
 * Remove a tag from a student.
 * Body: { tagId: string }
 * Requires coach role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { studentId } = await params;
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await removeTag(studentId, parsed.data.tagId, {
      source: "api",
    });

    if (!result.removed) {
      return NextResponse.json(
        { error: "Tag assignment not found" },
        { status: 404 }
      );
    }

    // Fire-and-forget: sync tag removal to GHL
    if (result.tag) {
      syncTagToGhl(studentId, result.tag.name, "remove", {
        tagType: result.tag.type,
      }).catch(console.error);
    }

    return NextResponse.json({ success: true, tag: result.tag });
  } catch (error) {
    console.error("Error removing tag:", error);
    return NextResponse.json(
      { error: "Failed to remove tag" },
      { status: 500 }
    );
  }
}
