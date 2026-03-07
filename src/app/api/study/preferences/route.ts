import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStudyPreferences, upsertStudyPreferences } from "@/lib/study";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preferences = await getStudyPreferences(user.id);
  return NextResponse.json({ preferences });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { dailyMinutes?: number };
  const minutes = Math.max(15, Math.min(120, Math.round(body.dailyMinutes ?? 30)));

  const preferences = await upsertStudyPreferences(user.id, minutes);
  return NextResponse.json({ preferences });
}
