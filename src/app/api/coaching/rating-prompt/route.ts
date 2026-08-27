import { NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { coachingSessionRatings, coachingSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { userCanUseFeature } from "@/lib/feature-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ prompt: null });
  }

  const [canUseOneOnOne, canUseInnerCircle] = await Promise.all([
    userCanUseFeature(user, "one_on_one_coaching"),
    userCanUseFeature(user, "inner_circle_group_coaching"),
  ]);
  if (!canUseOneOnOne && !canUseInnerCircle) {
    return NextResponse.json({ prompt: null });
  }

  const eligible = [];
  if (canUseOneOnOne) {
    eligible.push(
      and(
        eq(coachingSessions.type, "one_on_one"),
        ilike(coachingSessions.studentEmail, user.email),
      ),
    );
  }
  if (canUseInnerCircle) eligible.push(eq(coachingSessions.type, "inner_circle"));

  const [session] = await db
    .select({
      id: coachingSessions.id,
      title: coachingSessions.title,
      type: coachingSessions.type,
    })
    .from(coachingSessions)
    .leftJoin(
      coachingSessionRatings,
      and(
        eq(coachingSessionRatings.sessionId, coachingSessions.id),
        eq(coachingSessionRatings.userId, user.id),
      ),
    )
    .where(and(or(...eligible), isNull(coachingSessionRatings.id)))
    .orderBy(desc(coachingSessions.createdAt))
    .limit(1);

  if (!session) return NextResponse.json({ prompt: null });
  return NextResponse.json({
    prompt: {
      title: session.title,
      href:
        session.type === "one_on_one"
          ? "/dashboard/coaching/one-on-one"
          : "/dashboard/coaching/inner-circle",
    },
  });
}
