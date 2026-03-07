import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  vocabularyLists,
  vocabularyListItems,
  savedVocabulary,
} from "@/db/schema/vocabulary";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

const itemsSchema = z.object({
  savedVocabularyIds: z.array(z.string().uuid()).min(1),
});

// Add items to list
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;

  try {
    const json = await request.json();
    const { savedVocabularyIds } = itemsSchema.parse(json);

    // 1. Verify list ownership
    const list = await db.query.vocabularyLists.findFirst({
      where: and(
        eq(vocabularyLists.id, listId),
        eq(vocabularyLists.userId, userId)
      ),
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // 2. Verify saved words ownership
    const validWords = await db
      .select({ id: savedVocabulary.id })
      .from(savedVocabulary)
      .where(
        and(
          eq(savedVocabulary.userId, userId),
          inArray(savedVocabulary.id, savedVocabularyIds)
        )
      );

    const validIds = validWords.map((w) => w.id);

    if (validIds.length === 0) {
      return NextResponse.json(
        { error: "No valid vocabulary items found" },
        { status: 400 }
      );
    }

    // 3. Insert items (ignoring duplicates)
    // Drizzle doesn't support "ON CONFLICT DO NOTHING" easily with multi-row insert in all drivers,
    // but we can try catch or check existence.
    // Ideally use `onConflictDoNothing()`.
    
    await db
      .insert(vocabularyListItems)
      .values(
        validIds.map((id) => ({
          listId,
          savedVocabularyId: id,
        }))
      )
      .onConflictDoNothing();

    return NextResponse.json({ success: true, addedCount: validIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to add items to list:", error);
    return NextResponse.json(
      { error: "Failed to add items" },
      { status: 500 }
    );
  }
}

// Remove items from list
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;

  try {
    const json = await request.json();
    const { savedVocabularyIds } = itemsSchema.parse(json);

    // 1. Verify list ownership
    const list = await db.query.vocabularyLists.findFirst({
      where: and(
        eq(vocabularyLists.id, listId),
        eq(vocabularyLists.userId, userId)
      ),
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // 2. Delete items
    await db
      .delete(vocabularyListItems)
      .where(
        and(
          eq(vocabularyListItems.listId, listId),
          inArray(vocabularyListItems.savedVocabularyId, savedVocabularyIds)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to remove items from list:", error);
    return NextResponse.json(
      { error: "Failed to remove items" },
      { status: 500 }
    );
  }
}
