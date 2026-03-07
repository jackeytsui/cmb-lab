import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { submissions, users, lessons, interactions } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

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
    const status = searchParams.get("status") || "pending_review";
    const studentId = searchParams.get("studentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

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
          eq(submissions.status, status as "pending_review" | "reviewed" | "archived")
        )
      );
    } else {
      query.where(eq(submissions.status, status as "pending_review" | "reviewed" | "archived"));
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
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const json = await request.json();
    const { interactionId, lessonId, type, response, audioData, videoUrl } = json;

    if (!interactionId || !lessonId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // In a real app, we would run AI grading here. 
    // For now, placeholder grading.
    const score = 80; 
    const aiFeedback = "Good effort! Waiting for coach review.";

    const [submission] = await db
      .insert(submissions)
      .values({
        userId: currentUser.id,
        interactionId,
        lessonId,
        type,
        response: response || "",
        audioData,
        videoUrl,
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
