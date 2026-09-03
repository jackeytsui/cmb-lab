import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { conversations, lessons, modules, courses, users } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  canAccessLesson,
  resolvePermissions,
} from "@/lib/permissions";
import { hasFullFeatureAccess } from "@/lib/platform-roles";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

const createConversationSchema = z.object({
  lessonId: z.string().uuid(),
});

const listConversationsSchema = z.object({
  studentId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
});

/**
 * GET /api/conversations
 * List conversations with optional filters.
 * Users see their own conversations. Coaches see assigned students; admins
 * may view any student.
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
    const parsedFilters = listConversationsSchema.safeParse({
      studentId: searchParams.get("studentId") || undefined,
      lessonId: searchParams.get("lessonId") || undefined,
    });
    if (!parsedFilters.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { studentId, lessonId } = parsedFilters.data;
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
      const access = await getStaffStudentAccessContext();
      if (access.status !== "authorized") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const student = await db.query.users.findFirst({
        where: and(eq(users.id, studentId), isNull(users.deletedAt)),
        columns: { id: true, role: true, assignedCoachId: true, additionalCoachIds: true },
      });
      if (
        !student ||
        student.role !== "student" ||
        !canStaffAccessStudent({
          actorUserId: access.actor.id,
          actorRole: access.actor.role,
          assignedCoachId: student.assignedCoachId,
          additionalCoachIds: student.additionalCoachIds,
        })
      ) {
        return NextResponse.json(
          { error: "Student not found" },
          { status: 404 },
        );
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
    if (!hasFullFeatureAccess(currentUser.role)) {
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
