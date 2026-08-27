import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videoPrompts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

// DELETE /api/coach/video-prompts/[promptId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { promptId } = await params;
  if (!z.string().uuid().safeParse(promptId).success) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  try {
    const [deleted] = await db
      .delete(videoPrompts)
      .where(
        and(
          eq(videoPrompts.id, promptId),
          access.actor.role === "admin"
            ? undefined
            : eq(videoPrompts.coachId, access.actor.id),
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete video prompt:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt" },
      { status: 500 }
    );
  }
}
