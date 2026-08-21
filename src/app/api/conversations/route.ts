import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { conversations, lessons, modules, courses } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import {
  canAccessLesson,
  resolvePermissions,
} from "@/lib/permissions";

const createConversationSchema = z.object({
  lessonId: z.string().uuid(),
});

/**
 * GET /api/conversations
 * List conversations with optional filters.
 * Users see their own conversations. Coach/admin can view any student's.
 */
export async function GET(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Parse query params
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const lessonId = searchParams.get("lessonId");
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
    const parsedOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20;
    const offset = Number.isFinite(parsedOffset)
      ? Math.min(Math.max(parsedOffset, 0), 10_000)
      : 0;

    // 4. Determine which user's conversations to query
    let targetUserId = currentUser.id;

    if (studentId) {
      // Coach/admin can view any student's conversations
      const hasAccess = await hasMinimumRole("coach");
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      targetUserId = studentId;
    }

    // 5. Build and execute query
    const whereConditions = lessonId
      ? and(eq(conversations.userId, targetUserId), eq(conversations.lessonId, lessonId))
      : eq(conversations.userId, targetUserId);

    const conversationList = await db
      .select({
        id: conversations.id,
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
      .where(whereConditions)
      .orderBy(desc(conversations.startedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      conversations: conversationList,
      pagination: {
        limit,
        offset,
        hasMore: conversationList.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation record before starting WebRTC.
 */
export async function POST(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Parse body
    const parsedBody = createConversationSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid lesson" },
        { status: 400 }
      );
    }
    const { lessonId } = parsedBody.data;

    // 4. Verify lesson exists
    const lesson = await db.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
    });

    if (!lesson) {
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      );
    }
    if (currentUser.role !== "admin" && currentUser.role !== "coach") {
      const permissions = await resolvePermissions(currentUser.id);
      if (!(await canAccessLesson(permissions, lessonId))) {
        return NextResponse.json(
          { error: "Lesson not found" },
          { status: 404 },
        );
      }
    }

    // 5. Create conversation record
    const [newConversation] = await db
      .insert(conversations)
      .values({
        userId: currentUser.id,
        lessonId,
      })
      .returning();

    return NextResponse.json({
      conversation: newConversation,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
