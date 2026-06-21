import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { flashcardSaves } from "@/db/schema";
import {
  buildFlashcardContentKey,
  hasFlashcardText,
  normalizeFlashcardLanguage,
  type FlashcardSaveInput,
} from "@/lib/flashcards";
import { getCurrentUser } from "@/lib/auth";

function parseInput(body: unknown): FlashcardSaveInput | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const chinese = typeof data.chinese === "string" ? data.chinese : "";
  const input: FlashcardSaveInput = {
    chinese,
    simplified: typeof data.simplified === "string" ? data.simplified : null,
    pinyin: typeof data.pinyin === "string" ? data.pinyin : null,
    jyutping: typeof data.jyutping === "string" ? data.jyutping : null,
    english: typeof data.english === "string" ? data.english : null,
    sourceLabel: typeof data.sourceLabel === "string" ? data.sourceLabel : null,
    sourceType: typeof data.sourceType === "string" ? (data.sourceType as FlashcardSaveInput["sourceType"]) : "other",
    sourceId: typeof data.sourceId === "string" ? data.sourceId : null,
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : null,
    language: normalizeFlashcardLanguage(typeof data.language === "string" ? data.language : "unknown"),
  };
  return input;
}

async function findExisting(userId: string, contentKey: string) {
  const [existing] = await db
    .select()
    .from(flashcardSaves)
    .where(and(eq(flashcardSaves.userId, userId), eq(flashcardSaves.contentKey, contentKey)))
    .limit(1);
  return existing ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contentKey = searchParams.get("contentKey");
  const id = searchParams.get("id");

  if (id) {
    const [item] = await db
      .select()
      .from(flashcardSaves)
      .where(and(eq(flashcardSaves.id, id), eq(flashcardSaves.userId, user.id)))
      .limit(1);
    return NextResponse.json({ item: item ?? null });
  }

  if (contentKey) {
    const [item] = await db
      .select()
      .from(flashcardSaves)
      .where(and(eq(flashcardSaves.contentKey, contentKey), eq(flashcardSaves.userId, user.id)))
      .limit(1);
    return NextResponse.json({ item: item ?? null });
  }

  const items = await db
    .select()
    .from(flashcardSaves)
    .where(eq(flashcardSaves.userId, user.id));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = parseInput(await request.json());
  if (!input || !hasFlashcardText(input)) {
    return NextResponse.json({ error: "Missing flashcard text" }, { status: 400 });
  }

  const contentKey = buildFlashcardContentKey(input);
  const existing = await findExisting(user.id, contentKey);

  const values = {
    userId: user.id,
    contentKey,
    chinese: input.chinese.trim(),
    simplified: input.simplified?.trim() || null,
    pinyin: input.pinyin?.trim() || null,
    jyutping: input.jyutping?.trim() || null,
    english: input.english?.trim() || null,
    sourceType: input.sourceType ?? "other",
    sourceLabel: input.sourceLabel?.trim() || "Flashcards",
    sourceId: input.sourceId?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    language: input.language ?? "unknown",
  };

  if (existing) {
    const [updated] = await db
      .update(flashcardSaves)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(flashcardSaves.id, existing.id))
      .returning();

    return NextResponse.json({
      item: updated ?? existing,
      alreadySaved: true,
    });
  }

  const [inserted] = await db
    .insert(flashcardSaves)
    .values(values)
    .returning();

  return NextResponse.json({ item: inserted, alreadySaved: false }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const contentKey = searchParams.get("contentKey");

  if (!id && !contentKey) {
    return NextResponse.json({ error: "Missing id or contentKey" }, { status: 400 });
  }

  await db
    .delete(flashcardSaves)
    .where(
      and(
        eq(flashcardSaves.userId, user.id),
        id ? eq(flashcardSaves.id, id) : eq(flashcardSaves.contentKey, contentKey!),
      ),
    );

  return NextResponse.json({ success: true });
}
