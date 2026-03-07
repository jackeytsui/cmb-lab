import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  conversations,
  conversationTurns,
  lessons,
  modules,
  courses,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { awardXP } from "@/lib/xp-service";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

/**
 * GET /api/conversations/[conversationId]
 * Get conversation with all turns.
 * Owner or coach/admin can access.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { conversationId } = await params;

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
      })
      .from(conversations)
      .innerJoin(lessons, eq(conversations.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conversationData.length === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversation = conversationData[0];

    // 4. Check access: owner or coach/admin
    const isOwner = conversation.userId === currentUser.id;
    const hasAccess = isOwner || (await hasMinimumRole("coach"));

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const body = await request.json();
    const { endedAt, turns } = body;

    // 6. Handle ending conversation
    if (endedAt === true) {
      const now = new Date();
      const durationSeconds = Math.floor(
        (now.getTime() - conversation.startedAt.getTime()) / 1000
      );

      await db
        .update(conversations)
        .set({
          endedAt: now,
          durationSeconds,
        })
        .where(eq(conversations.id, conversationId));

      // Fire-and-forget: award XP for conversations lasting at least 30 seconds
      if (durationSeconds >= 30) {
        awardXP({
          userId: currentUser.id,
          source: "voice_conversation",
          amount: 15,
          entityId: conversationId,
          entityType: "conversation",
        }).catch((err) =>
          console.error("[XP] Conversation XP award failed:", err)
        );
      }
    }

    // 7. Handle batch inserting turns
    if (turns && Array.isArray(turns) && turns.length > 0) {
      const turnRecords = turns.map(
        (turn: { role: "user" | "assistant"; content: string; timestamp: number }) => ({
          conversationId,
          role: turn.role,
          content: turn.content,
          timestamp: turn.timestamp,
        })
      );

      await db.insert(conversationTurns).values(turnRecords);
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
