import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDueCards } from "@/lib/srs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = request.nextUrl.searchParams.get("deckId") ?? undefined;
  const dueCards = await getDueCards(user.id, 1, deckId);
  const nextCard = dueCards[0] ?? null;

  return NextResponse.json({ card: nextCard, queueSize: dueCards.length });
}
