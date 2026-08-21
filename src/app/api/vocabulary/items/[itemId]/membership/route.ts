import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  savedVocabulary,
  vocabularyListItems,
  vocabularyLists,
} from "@/db/schema/vocabulary";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;

  try {
    const items = await db
      .select({ listId: vocabularyListItems.listId })
      .from(vocabularyListItems)
      .innerJoin(
        vocabularyLists,
        eq(vocabularyListItems.listId, vocabularyLists.id),
      )
      .innerJoin(
        savedVocabulary,
        eq(vocabularyListItems.savedVocabularyId, savedVocabulary.id),
      )
      .where(
        and(
          eq(vocabularyListItems.savedVocabularyId, itemId),
          eq(vocabularyLists.userId, user.id),
          eq(savedVocabulary.userId, user.id),
        ),
      );

    return NextResponse.json({ listIds: items.map((i) => i.listId) });
  } catch (error) {
    console.error("Failed to fetch item membership:", error);
    return NextResponse.json(
      { error: "Failed to fetch membership" },
      { status: 500 }
    );
  }
}
