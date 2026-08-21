import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vocabularyLists } from "@/db/schema/vocabulary";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

const updateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2_000).optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;

  try {
    const deleted = await db
      .delete(vocabularyLists)
      .where(
        and(
          eq(vocabularyLists.id, listId),
          eq(vocabularyLists.userId, user.id)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete vocabulary list:", error);
    return NextResponse.json(
      { error: "Failed to delete list" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;

  try {
    const json = await request.json();
    const { name, description } = updateListSchema.parse(json);

    const updated = await db
      .update(vocabularyLists)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vocabularyLists.id, listId),
          eq(vocabularyLists.userId, user.id)
        )
      )
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json({ list: updated[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to update vocabulary list:", error);
    return NextResponse.json(
      { error: "Failed to update list" },
      { status: 500 }
    );
  }
}
