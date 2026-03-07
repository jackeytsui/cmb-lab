import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { srsDecks } from "@/db/schema";
import { getDecksWithCounts, getOrCreateDefaultDeck } from "@/lib/srs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await getOrCreateDefaultDeck(user.id);
  const decks = await getDecksWithCounts(user.id);
  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Deck name is required" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(eq(srsDecks.userId, user.id), eq(srsDecks.name, body.name.trim())));

  if (existing) {
    return NextResponse.json({ error: "Deck already exists" }, { status: 409 });
  }

  const [deck] = await db
    .insert(srsDecks)
    .values({
      userId: user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      isDefault: false,
    })
    .returning();

  return NextResponse.json({ deck }, { status: 201 });
}
