import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { videoPrompts, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// DELETE /api/coach/video-prompts/[promptId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { promptId } = await params;

  try {
    const [deleted] = await db
      .delete(videoPrompts)
      .where(
        and(
          eq(videoPrompts.id, promptId),
          eq(videoPrompts.coachId, currentUser.id) // Ensure coach owns it
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Prompt not found or unauthorized" }, { status: 404 });
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
