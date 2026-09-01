import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getIgcCoachingAnnouncement } from "@/lib/group-coaching-announcement";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const announcement =
    user.role === "student"
      ? await getIgcCoachingAnnouncement(user.id, user.timezone)
      : null;

  return NextResponse.json(
    { announcement },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
