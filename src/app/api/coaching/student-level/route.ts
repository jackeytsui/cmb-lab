import { NextRequest, NextResponse } from "next/server";
import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/coaching/student-level?studentEmail=...
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("studentEmail");
  if (!email) {
    return NextResponse.json({ error: "studentEmail required" }, { status: 400 });
  }

  const student = await db.query.users.findFirst({
    where: ilike(users.email, email.trim()),
    columns: { coachingLevel: true, coachingLessonNumber: true },
  });

  return NextResponse.json({
    level: student?.coachingLevel ?? null,
    lessonNumber: student?.coachingLessonNumber ?? null,
  });
}

/**
 * PATCH /api/coaching/student-level
 * Body: { studentEmail, level, lessonNumber }
 */
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { studentEmail, level, lessonNumber } = body as {
      studentEmail: string;
      level?: string | null;
      lessonNumber?: string | null;
    };

    if (!studentEmail) {
      return NextResponse.json({ error: "studentEmail required" }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set({
        coachingLevel: level?.trim() || null,
        coachingLessonNumber: lessonNumber?.trim() || null,
      })
      .where(ilike(users.email, studentEmail.trim()))
      .returning({
        id: users.id,
        coachingLevel: users.coachingLevel,
        coachingLessonNumber: users.coachingLessonNumber,
      });

    if (!updated) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      level: updated.coachingLevel,
      lessonNumber: updated.coachingLessonNumber,
    });
  } catch (err) {
    console.error("Failed to update student level:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
