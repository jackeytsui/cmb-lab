import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  conversations,
  conversationTurns,
  lessons,
  modules,
  courses,
  users,
} from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { awardXP } from "@/lib/xp-service";
import { z } from "zod";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

const updateConversationSchema = z
  .object({
    endedAt: z.literal(true).optional(),
    turns: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(20_000),
          timestamp: z.number().int().min(0).max(24 * 60 * 60),
        }),
      )
      .max(500)
      .optional(),
  })
  .refine(
    (body) => body.endedAt === true || Boolean(body.turns?.length),
    "No conversation update provided",
  );

const conversationIdSchema = z.string().uuid();

/**
 * GET /api/conversations/[conversationId]
 * Get conversation with all turns.
 * Owner or coach/admin can access.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { conversationId } = await params;
    if (!conversationIdSchema.safeParse(conversationId).success) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Fetch conversation with lesson info
    const conversationData = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        lessonId: conversations.lessonId,
        startedAt: conversations.startedAt,
        endedAt: conversations.endedAt,
        durationSeconds: conversations.durationSeconds,
        createdAt: conversations.createdAt,
        lessonTitle: lessons.title,
        moduleTitle: modules.title,
        courseTitle: courses.title,
        assignedCoachId: users.assignedCoachId,
      })
      .from(conversations)
      .innerJoin(lessons, eq(conversations.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .innerJoin(users, eq(conversations.userId, users.id))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conversationData.length === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversation = conversationData[0];

    // 4. Check access: owner, assigned coach, or administrator.
    const isOwner = conversation.userId === currentUser.id;
    if (!isOwner) {
      const access = await getStaffStudentAccessContext();
      if (
        access.status !== "authorized" ||
        !canStaffAccessStudent({
          actorUserId: access.actor.id,
          actorRole: access.actor.role,
          assignedCoachId: conversation.assignedCoachId,
        })
      ) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }
    }

    // 5. Fetch turns ordered by timestamp
    const turns = await db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(asc(conversationTurns.timestamp));

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        userId: conversation.userId,
        lessonId: conversation.lessonId,
        startedAt: conversation.startedAt,
        endedAt: conversation.endedAt,
        durationSeconds: conversation.durationSeconds,
        createdAt: conversation.createdAt,
      },
      lesson: {
        id: conversation.lessonId,
        title: conversation.lessonTitle,
        moduleTitle: conversation.moduleTitle,
        courseTitle: conversation.courseTitle,
      },
      turns,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/conversations/[conversationId]
 * Update conversation: end it or add turns.
 * Owner only.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { conversationId } = await params;
    if (!conversationIdSchema.safeParse(conversationId).success) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Fetch conversation
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 4. Check ownership
    if (conversation.userId !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Parse body
    const parsedBody = updateConversationSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid conversation update" },
        { status: 400 },
      );
    }
    const { endedAt, turns } = parsedBody.data;

    if (conversation.endedAt) {
      return NextResponse.json(
        { error: "Conversation is already complete" },
        { status: 409 },
      );
    }

    const durationSeconds = endedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - conversation.startedAt.getTime()) / 1000,
          ),
        )
      : null;

    // Persist transcript and completion atomically. The guarded completion
    // update prevents concurrent disconnect requests from duplicating turns.
    const completed = await db.transaction(async (tx) => {
      if (endedAt) {
        const [updated] = await tx
          .update(conversations)
          .set({ endedAt: new Date(), durationSeconds })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.userId, currentUser.id),
              isNull(conversations.endedAt),
            ),
          )
          .returning({ id: conversations.id });
        if (!updated) return false;
      }

      if (turns && turns.length > 0) {
        await tx.insert(conversationTurns).values(
          turns.map((turn) => ({
            conversationId,
            role: turn.role,
            content: turn.content,
            timestamp: turn.timestamp,
          })),
        );
      }
      return true;
    });

    if (!completed) {
      return NextResponse.json(
        { error: "Conversation is already complete" },
        { status: 409 },
      );
    }

    if (durationSeconds !== null && durationSeconds >= 30) {
      await awardXP({
        userId: currentUser.id,
        source: "voice_conversation",
        amount: 15,
        entityId: conversationId,
        entityType: "conversation",
      }).catch((err) => {
        console.error("[XP] Conversation XP award failed:", err);
      });
    }

    // 8. Fetch updated conversation
    const updated = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    return NextResponse.json({
      conversation: updated,
    });
  } catch (error) {
    console.error("Error updating conversation:", error);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 }
    );
  }
}
