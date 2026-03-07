import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  interactionAttempts,
  interactions,
  users,
  lessons,
  submissions,
} from "@/db/schema";
import { eq } from "drizzle-orm";

interface AILog {
  id: string;
  type: "text" | "audio" | "video";
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  interactionPrompt: string;
  studentResponse: string;
  transcription: string | null;
  score: number;
  aiFeedback: string;
  passed: boolean;
  createdAt: string;
  source: "attempt" | "submission";
}

/**
 * GET /api/admin/ai-logs
 * List AI feedback events from interactionAttempts and submissions.
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 3. Parse query params
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const type = searchParams.get("type") || "all"; // "text" | "audio" | "all"
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 4. Fetch from interactionAttempts (text interactions during video)
    const attemptsQuery = db
      .select({
        id: interactionAttempts.id,
        type: interactions.type,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        lessonTitle: lessons.title,
        interactionPrompt: interactions.prompt,
        studentResponse: interactionAttempts.response,
        score: interactionAttempts.score,
        aiFeedback: interactionAttempts.feedback,
        isCorrect: interactionAttempts.isCorrect,
        createdAt: interactionAttempts.createdAt,
      })
      .from(interactionAttempts)
      .innerJoin(
        interactions,
        eq(interactionAttempts.interactionId, interactions.id)
      )
      .innerJoin(users, eq(interactionAttempts.userId, users.id))
      .innerJoin(lessons, eq(interactions.lessonId, lessons.id));

    // 5. Fetch from submissions (coach queue items)
    const submissionsQuery = db
      .select({
        id: submissions.id,
        type: submissions.type,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        lessonTitle: lessons.title,
        interactionPrompt: interactions.prompt,
        studentResponse: submissions.response,
        transcription: submissions.transcription,
        score: submissions.score,
        aiFeedback: submissions.aiFeedback,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(lessons, eq(submissions.lessonId, lessons.id))
      .innerJoin(interactions, eq(submissions.interactionId, interactions.id));

    // 6. Execute both queries
    const [attemptsData, submissionsData] = await Promise.all([
      attemptsQuery,
      submissionsQuery,
    ]);

    // 7. Transform and merge results
    const logs: AILog[] = [];

    // Add attempts (source: "attempt")
    for (const attempt of attemptsData) {
      // Apply filters
      if (studentId && attempt.studentId !== studentId) continue;
      if (type !== "all" && attempt.type !== type) continue;
      if (startDate && new Date(attempt.createdAt) < new Date(startDate))
        continue;
      if (endDate && new Date(attempt.createdAt) > new Date(endDate)) continue;

      logs.push({
        id: attempt.id,
        type: attempt.type,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        studentEmail: attempt.studentEmail,
        lessonTitle: attempt.lessonTitle,
        interactionPrompt: attempt.interactionPrompt,
        studentResponse: attempt.studentResponse,
        transcription: null,
        score: attempt.score,
        aiFeedback: attempt.aiFeedback,
        passed: attempt.isCorrect,
        createdAt: attempt.createdAt.toISOString(),
        source: "attempt",
      });
    }

    // Add submissions (source: "submission")
    for (const submission of submissionsData) {
      // Apply filters
      if (studentId && submission.studentId !== studentId) continue;
      if (type !== "all" && submission.type !== type) continue;
      if (startDate && new Date(submission.createdAt) < new Date(startDate))
        continue;
      if (endDate && new Date(submission.createdAt) > new Date(endDate))
        continue;

      // Submissions in queue are those that didn't pass (< threshold)
      // Default threshold is 80, but we don't have it here, so use 80 as default
      const passed = submission.score >= 80;

      logs.push({
        id: submission.id,
        type: submission.type,
        studentId: submission.studentId,
        studentName: submission.studentName,
        studentEmail: submission.studentEmail,
        lessonTitle: submission.lessonTitle,
        interactionPrompt: submission.interactionPrompt,
        studentResponse: submission.studentResponse,
        transcription: submission.transcription,
        score: submission.score,
        aiFeedback: submission.aiFeedback,
        passed,
        createdAt: submission.createdAt.toISOString(),
        source: "submission",
      });
    }

    // 8. Sort by createdAt DESC
    logs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 9. Apply pagination
    const total = logs.length;
    const paginatedLogs = logs.slice(offset, offset + limit);

    return NextResponse.json({
      logs: paginatedLogs,
      total,
    });
  } catch (error) {
    console.error("Error fetching AI logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI logs" },
      { status: 500 }
    );
  }
}
