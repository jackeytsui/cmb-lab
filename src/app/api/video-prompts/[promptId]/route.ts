import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  interactions,
  practiceExercises,
  practiceSets,
  videoPrompts,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { canUserAccessPracticeSet } from "@/lib/assignments";
import { canAccessLesson, resolvePermissions } from "@/lib/permissions";
import { hasFullFeatureAccess } from "@/lib/platform-roles";

// GET /api/video-prompts/[promptId]
// Public or Student-facing route to get video prompt details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { promptId } = await params;
  if (!z.string().uuid().safeParse(promptId).success) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  try {
    const prompt = await db.query.videoPrompts.findFirst({
      where: eq(videoPrompts.id, promptId),
      columns: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        transcript: true,
      },
    });

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if (!hasFullFeatureAccess(user.role)) {
      const [lessonLinks, practiceLinks] = await Promise.all([
        db
          .select({ lessonId: interactions.lessonId })
          .from(interactions)
          .where(
            and(
              eq(interactions.videoPromptId, promptId),
              isNull(interactions.deletedAt),
            ),
          ),
        db
          .select({ practiceSetId: practiceExercises.practiceSetId })
          .from(practiceExercises)
          .innerJoin(
            practiceSets,
            eq(practiceExercises.practiceSetId, practiceSets.id),
          )
          .where(
            and(
              sql`${practiceExercises.definition}->>'videoPromptId' = ${promptId}`,
              isNull(practiceExercises.deletedAt),
              isNull(practiceSets.deletedAt),
              eq(practiceSets.status, "published"),
            ),
          ),
      ]);

      const permissions = await resolvePermissions(user.id);
      let canAccess = false;
      for (const link of lessonLinks) {
        if (await canAccessLesson(permissions, link.lessonId)) {
          canAccess = true;
          break;
        }
      }
      if (!canAccess) {
        for (const link of practiceLinks) {
          if (await canUserAccessPracticeSet(user.id, link.practiceSetId)) {
            canAccess = true;
            break;
          }
        }
      }
      if (!canAccess) {
        return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("Failed to fetch video prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}
