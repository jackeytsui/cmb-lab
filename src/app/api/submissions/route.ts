import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  interactions,
  lessons,
  studentMediaUploads,
  submissions,
  users,
} from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  canAccessLesson,
  resolvePermissions,
} from "@/lib/permissions";
import { hasFullFeatureAccess } from "@/lib/platform-roles";

const createSubmissionSchema = z.object({
  interactionId: z.string().uuid(),
  lessonId: z.string().uuid(),
  type: z.enum(["text", "audio", "video"]),
  response: z.string().max(20_000).optional(),
  audioUrl: z.string().max(500).optional(),
  videoUrl: z.string().max(500).optional(),
}).strict();

const listSubmissionsSchema = z.object({
  status: z.enum(["pending_review", "reviewed", "archived"]).default("pending_review"),
  studentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

function studentUploadId(url: string): string | null {
  const match = /^\/api\/submissions\/media\/([0-9a-f-]{36})$/.exec(url);
  return match?.[1] ?? null;
}

/**
 * GET /api/submissions
 * List submissions with filters for coach review.
 * Requires coach or admin role.
 */
export async function GET(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has coach role or higher
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 3. Parse query params
    const { searchParams } = new URL(request.url);
    const parsed = listSubmissionsSchema.safeParse({
      status: searchParams.get("status") || undefined,
      studentId: searchParams.get("studentId") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { status, studentId, limit, offset } = parsed.data;

    // 4. Build and execute query with joins
    const query = db
      .select({
        // Submission data
        id: submissions.id,
        type: submissions.type,
        response: submissions.response,
        audioData: submissions.audioData,
        videoUrl: submissions.videoUrl,
        score: submissions.score,
        aiFeedback: submissions.aiFeedback,
        transcription: submissions.transcription,
        status: submissions.status,
        createdAt: submissions.createdAt,
        // Student info
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        // Lesson info
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        // Interaction info
        interactionId: interactions.id,
        interactionPrompt: interactions.prompt,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(interactions, eq(submissions.interactionId, interactions.id))
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply filters conditionally
    if (studentId) {
      query.where(
        and(
          eq(submissions.userId, studentId),
          eq(submissions.status, status)
        )
      );
    } else {
      query.where(eq(submissions.status, status));
    }

    const submissionList = await query;

    return NextResponse.json({
      submissions: submissionList,
      pagination: {
        limit,
        offset,
        hasMore: submissionList.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch submissions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/submissions
 * Create a new submission.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRealUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = createSubmissionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
    }
    const { interactionId, lessonId, type, response, audioUrl, videoUrl } =
      parsed.data;

    const interaction = await db.query.interactions.findFirst({
      where: and(
        eq(interactions.id, interactionId),
        eq(interactions.lessonId, lessonId),
        isNull(interactions.deletedAt),
      ),
      columns: { id: true, type: true },
    });
    const responseTypeAllowed =
      interaction?.type === type ||
      (interaction?.type === "video" && type === "audio");
    if (!interaction || !responseTypeAllowed) {
      return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
    }

    if (!hasFullFeatureAccess(currentUser.role)) {
      const permissions = await resolvePermissions(currentUser.id);
      if (!(await canAccessLesson(permissions, lessonId))) {
        return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
      }
    }

    const mediaUrl = videoUrl ?? audioUrl ?? null;
    if (type === "text" && !response?.trim()) {
      return NextResponse.json({ error: "Response is required" }, { status: 400 });
    }
    if (type !== "text") {
      const uploadId = mediaUrl ? studentUploadId(mediaUrl) : null;
      if (!uploadId) {
        return NextResponse.json({ error: "Recording is required" }, { status: 400 });
      }
      const upload = await db.query.studentMediaUploads.findFirst({
        where: and(
          eq(studentMediaUploads.id, uploadId),
          eq(studentMediaUploads.userId, currentUser.id),
        ),
        columns: { contentType: true },
      });
      if (!upload || !upload.contentType.startsWith(`${type}/`)) {
        return NextResponse.json({ error: "Recording not found" }, { status: 404 });
      }
    }

    // Media interactions are reviewed by a coach; do not fabricate an AI score.
    const score = null;
    const aiFeedback = "Awaiting coach review.";

    const [submission] = await db
      .insert(submissions)
      .values({
        userId: currentUser.id,
        interactionId,
        lessonId,
        type,
        response: response?.trim() || "",
        audioData: null,
        videoUrl: mediaUrl,
        score,
        aiFeedback,
        status: "pending_review",
      })
      .returning();

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit response" },
      { status: 500 }
    );
  }
}
