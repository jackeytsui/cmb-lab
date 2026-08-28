import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getStudyPreferences, upsertStudyPreferences } from "@/lib/study";

const preferenceSchema = z.object({
  dailyMinutes: z.number().int().min(10).max(180),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preferences = await getStudyPreferences(user.id);
  return NextResponse.json({ preferences });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = preferenceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Daily study goal must be between 10 and 180 minutes" },
      { status: 400 },
    );
  }

  const preferences = await upsertStudyPreferences(
    user.id,
    parsed.data.dailyMinutes,
  );
  return NextResponse.json({ preferences });
}
