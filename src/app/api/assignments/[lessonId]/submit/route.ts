import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, lessons, lessonSubmissions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { isAssignmentType } from "@/lib/assignment-types";

const bodySchema = z.object({
  submissionData: z.string().min(1), // JSON string
});

/**
 * POST /api/assignments/[lessonId]/submit
 * Upsert a student submission for an assignment-type lesson.
 * Forbidden once the submission has been reviewed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Verify lesson exists and is an assignment type
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { lessonType: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (!isAssignmentType(lesson.lessonType)) {
    return NextResponse.json({ error: "Not an assignment lesson" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  // Validate it's parseable JSON
  try {
    JSON.parse(parsed.data.submissionData);
  } catch {
    return NextResponse.json({ error: "submissionData must be valid JSON" }, { status: 400 });
  }

  // Check if already reviewed — disallow edits after review
  const existing = await db.query.lessonSubmissions.findFirst({
    where: and(
      eq(lessonSubmissions.lessonId, lessonId),
      eq(lessonSubmissions.userId, dbUser.id),
    ),
    columns: { id: true, status: true },
  });
  if (existing?.status === "reviewed") {
    return NextResponse.json({ error: "Submission already reviewed — cannot edit" }, { status: 409 });
  }

  // Upsert submission
  const [submission] = await db
    .insert(lessonSubmissions)
    .values({
      lessonId,
      userId: dbUser.id,
      submissionData: parsed.data.submissionData,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [lessonSubmissions.lessonId, lessonSubmissions.userId],
      set: {
        submissionData: parsed.data.submissionData,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ submission });
}
