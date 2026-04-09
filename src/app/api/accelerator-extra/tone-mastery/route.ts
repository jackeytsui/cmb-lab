import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { toneMasteryClips, toneMasteryProgress, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * GET /api/accelerator-extra/tone-mastery
 * Returns all tone mastery clips + user progress + hero video URL.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [clips, progress, heroRow] = await Promise.all([
    db
      .select()
      .from(toneMasteryClips)
      .orderBy(asc(toneMasteryClips.sortOrder), asc(toneMasteryClips.groupNumber)),
    db
      .select({
        clipId: toneMasteryProgress.clipId,
        selfRating: toneMasteryProgress.selfRating,
      })
      .from(toneMasteryProgress)
      .where(eq(toneMasteryProgress.userId, dbUser.id)),
    db.execute(
      sql`SELECT value FROM app_settings WHERE key = 'tone_mastery.hero_video_url' LIMIT 1`,
    ),
  ]);

  const ratings: Record<string, string> = {};
  for (const p of progress) {
    ratings[p.clipId] = p.selfRating;
  }

  const heroVideoUrl =
    (heroRow.rows[0]?.value as string) || "";

  return NextResponse.json({ clips, ratings, heroVideoUrl });
}
