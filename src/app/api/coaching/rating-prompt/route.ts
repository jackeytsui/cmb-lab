import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
  exists,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  coachingFeedbackPromptStates,
  coachingNotes,
  coachingSessionRatings,
  coachingSessions,
  users,
} from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import {
  COACHING_FEEDBACK_PROMPT_MAX_SHOWS_PER_SESSION,
  coachingFeedbackPromptWindow,
} from "@/lib/coaching-feedback-prompt";
import { getRateableCoachingSession } from "@/lib/coaching-session-rating-access";
import { userCanUseFeature } from "@/lib/feature-access";

export const dynamic = "force-dynamic";

const promptActionSchema = z.object({
  action: z.enum(["shown", "skip"]),
  sessionId: z.string().uuid(),
});

export async function GET() {
  // Real-user identity is intentional: admin View As must not consume a
  // student's prompt allowance or submit feedback on their behalf.
  const user = await getRealUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ prompt: null });
  }

  const { cooldownStartedAt, latestEligibleAt, oldestEligibleAt } =
    coachingFeedbackPromptWindow();

  const recentPrompt = await db.query.coachingFeedbackPromptStates.findFirst({
    where: and(
      eq(coachingFeedbackPromptStates.userId, user.id),
      gte(coachingFeedbackPromptStates.lastPromptedAt, cooldownStartedAt),
    ),
    columns: { id: true },
  });
  if (recentPrompt) return NextResponse.json({ prompt: null });

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
  if (canUseInnerCircle) {
    eligible.push(eq(coachingSessions.type, "inner_circle"));
  }

  const sessionHasNotes = exists(
    db
      .select({ id: coachingNotes.id })
      .from(coachingNotes)
      .where(eq(coachingNotes.sessionId, coachingSessions.id)),
  );

  const [session] = await db
    .select({
      id: coachingSessions.id,
      title: coachingSessions.title,
      type: coachingSessions.type,
      createdAt: coachingSessions.createdAt,
      coachName: users.name,
    })
    .from(coachingSessions)
    .innerJoin(users, eq(coachingSessions.createdBy, users.id))
    .leftJoin(
      coachingSessionRatings,
      and(
        eq(coachingSessionRatings.sessionId, coachingSessions.id),
        eq(coachingSessionRatings.userId, user.id),
      ),
    )
    .leftJoin(
      coachingFeedbackPromptStates,
      and(
        eq(coachingFeedbackPromptStates.sessionId, coachingSessions.id),
        eq(coachingFeedbackPromptStates.userId, user.id),
      ),
    )
    .where(
      and(
        or(...eligible),
        isNull(coachingSessionRatings.id),
        isNull(coachingFeedbackPromptStates.skippedAt),
        sql`coalesce(${coachingFeedbackPromptStates.promptCount}, 0) < ${COACHING_FEEDBACK_PROMPT_MAX_SHOWS_PER_SESSION}`,
        gte(coachingSessions.createdAt, oldestEligibleAt),
        lte(coachingSessions.createdAt, latestEligibleAt),
        or(isNotNull(coachingSessions.recordingUrl), sessionHasNotes),
      ),
    )
    .orderBy(desc(coachingSessions.createdAt))
    .limit(1);

  if (!session) return NextResponse.json({ prompt: null });

  return NextResponse.json({
    prompt: {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      coachName: session.coachName,
      occurredAt: session.createdAt.toISOString(),
    },
  });
}

export async function POST(request: Request) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "student") {
    return NextResponse.json(
      { error: "Only students can update feedback prompts" },
      { status: 403 },
    );
  }

  const parsed = promptActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid prompt action" }, { status: 400 });
  }

  const { action, sessionId } = parsed.data;
  const session = await getRateableCoachingSession(user, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const now = new Date();
  if (action === "shown") {
    await db
      .insert(coachingFeedbackPromptStates)
      .values({
        sessionId,
        userId: user.id,
        promptCount: 1,
        lastPromptedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          coachingFeedbackPromptStates.sessionId,
          coachingFeedbackPromptStates.userId,
        ],
        set: {
          promptCount: sql`least(${coachingFeedbackPromptStates.promptCount} + 1, ${COACHING_FEEDBACK_PROMPT_MAX_SHOWS_PER_SESSION})`,
          lastPromptedAt: now,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(coachingFeedbackPromptStates)
      .values({
        sessionId,
        userId: user.id,
        skippedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          coachingFeedbackPromptStates.sessionId,
          coachingFeedbackPromptStates.userId,
        ],
        set: { skippedAt: now, updatedAt: now },
      });
  }

  return NextResponse.json({ ok: true });
}
