import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { vocabularyListItems } from "@/db/schema/vocabulary";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;

  try {
    const items = await db
      .select({ listId: vocabularyListItems.listId })
      .from(vocabularyListItems)
      .where(eq(vocabularyListItems.savedVocabularyId, itemId));

    return NextResponse.json({ listIds: items.map((i) => i.listId) });
  } catch (error) {
    console.error("Failed to fetch item membership:", error);
    return NextResponse.json(
      { error: "Failed to fetch membership" },
      { status: 500 }
    );
  }
}
