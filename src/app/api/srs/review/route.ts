import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reviewCard } from "@/lib/srs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    cardId?: string;
    rating?: "again" | "hard" | "good" | "easy";
  };

  if (!body.cardId || !body.rating) {
    return NextResponse.json({ error: "cardId and rating are required" }, { status: 400 });
  }

  try {
    const card = await reviewCard({
      userId: user.id,
      cardId: body.cardId,
      rating: body.rating,
    });

    return NextResponse.json({ card });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review card";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
