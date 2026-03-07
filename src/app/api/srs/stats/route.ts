import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDecksWithCounts, getSrsStats } from "@/lib/srs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [stats, decks] = await Promise.all([
    getSrsStats(user.id),
    getDecksWithCounts(user.id),
  ]);

  return NextResponse.json({ stats, decks });
}
