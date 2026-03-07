import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStudyToday } from "@/lib/study";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = await getStudyToday(user.id);
  return NextResponse.json(today);
}
