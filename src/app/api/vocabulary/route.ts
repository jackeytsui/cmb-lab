import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { savedVocabulary } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET /api/vocabulary
 *
 * Returns the authenticated user's saved vocabulary words as an array
 * of { id, traditional } for client-side bookmark state tracking.
 * Called once on reader page mount to populate the saved set.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await db
      .select({
        id: savedVocabulary.id,
        traditional: savedVocabulary.traditional,
        simplified: savedVocabulary.simplified,
      })
      .from(savedVocabulary)
      .where(eq(savedVocabulary.userId, user.id));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to fetch saved vocabulary:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved vocabulary" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vocabulary
 *
 * Save a word to the user's vocabulary. Detects duplicates by checking
 * for an existing entry with the same traditional form.
 *
 * Body: { traditional, simplified, pinyin?, jyutping?, definitions }
 * Returns: { id, alreadySaved: boolean }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { traditional, simplified, pinyin, jyutping, definitions } = body as {
      traditional: string;
      simplified: string;
      pinyin?: string;
      jyutping?: string;
      definitions: string[];
    };

    if (!traditional || !simplified || !definitions) {
      return NextResponse.json(
        { error: "Missing required fields: traditional, simplified, definitions" },
        { status: 400 }
      );
    }

    // Check for existing entry to prevent duplicates
    const [existing] = await db
      .select({ id: savedVocabulary.id })
      .from(savedVocabulary)
      .where(
        and(
          eq(savedVocabulary.userId, user.id),
          eq(savedVocabulary.traditional, traditional)
        )
      );

    if (existing) {
      return NextResponse.json({ id: existing.id, alreadySaved: true });
    }

    // Insert new saved vocabulary entry
    const [inserted] = await db
      .insert(savedVocabulary)
      .values({
        userId: user.id,
        traditional,
        simplified,
        pinyin: pinyin ?? null,
        jyutping: jyutping ?? null,
        definitions,
      })
      .returning({ id: savedVocabulary.id });

    return NextResponse.json({ id: inserted.id, alreadySaved: false }, { status: 201 });
  } catch (error) {
    console.error("Failed to save vocabulary:", error);
    return NextResponse.json(
      { error: "Failed to save vocabulary" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vocabulary
 *
 * Remove a saved word by ID. Scoped to the authenticated user
 * to prevent deleting other users' vocabulary.
 *
 * Query: ?id=<uuid>
 * Returns: { success: true }
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter" },
        { status: 400 }
      );
    }

    await db
      .delete(savedVocabulary)
      .where(
        and(
          eq(savedVocabulary.id, id),
          eq(savedVocabulary.userId, user.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete vocabulary:", error);
    return NextResponse.json(
      { error: "Failed to delete vocabulary" },
      { status: 500 }
    );
  }
}
