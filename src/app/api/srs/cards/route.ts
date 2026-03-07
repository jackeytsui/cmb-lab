import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { srsCards } from "@/db/schema";
import { createSrsCardFromDictionaryWord } from "@/lib/srs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = request.nextUrl.searchParams.get("deckId");
  const whereClause = deckId
    ? and(eq(srsCards.userId, user.id), eq(srsCards.deckId, deckId), isNull(srsCards.archivedAt))
    : and(eq(srsCards.userId, user.id), isNull(srsCards.archivedAt));

  const cards = await db.query.srsCards.findMany({ where: whereClause, orderBy: [asc(srsCards.createdAt)] });
  return NextResponse.json({ cards });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    deckId?: string;
    traditional?: string;
    simplified?: string;
    pinyin?: string;
    jyutping?: string;
    meaning?: string;
    example?: string;
  };

  if (!body.traditional?.trim() || !body.meaning?.trim()) {
    return NextResponse.json({ error: "traditional and meaning are required" }, { status: 400 });
  }

  const card = await createSrsCardFromDictionaryWord({
    userId: user.id,
    deckId: body.deckId,
    traditional: body.traditional.trim(),
    simplified: body.simplified?.trim() || body.traditional.trim(),
    pinyin: body.pinyin?.trim(),
    jyutping: body.jyutping?.trim(),
    meaning: body.meaning.trim(),
    example: body.example?.trim(),
    sourceType: "manual",
  });

  return NextResponse.json({ card }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    cardId?: string;
    deckId?: string | null;
    archived?: boolean;
  };

  if (!body.cardId) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(srsCards)
    .set({
      deckId: body.deckId ?? null,
      archivedAt: body.archived ? new Date() : null,
    })
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  return NextResponse.json({ card: updated });
}
