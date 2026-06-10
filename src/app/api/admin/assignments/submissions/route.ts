import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessonSubmissions, lessons, users } from "@/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { isAssignmentType } from "@/lib/assignment-types";

/**
 * GET /api/admin/assignments/submissions
 * Returns all assignment submissions for coach review.
 * Optional query params: status=pending|reviewed, lessonType=challenge|...
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");
  const typeFilter = request.nextUrl.searchParams.get("lessonType");

  // Fetch all submissions with lesson + user info
  const rows = await db
    .select({
      submission: lessonSubmissions,
      lesson: {
        id: lessons.id,
        title: lessons.title,
        lessonType: lessons.lessonType,
        assignmentConfig: lessons.assignmentConfig,
      },
      student: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
    })
    .from(lessonSubmissions)
    .innerJoin(lessons, eq(lessonSubmissions.lessonId, lessons.id))
    .innerJoin(users, eq(lessonSubmissions.userId, users.id))
    .where(isNull(lessons.deletedAt))
    .orderBy(desc(lessonSubmissions.createdAt));

  // Filter out non-assignment lessons (shouldn't happen, but guard)
  let result = rows.filter((r) => isAssignmentType(r.lesson.lessonType));
  if (statusFilter === "pending" || statusFilter === "reviewed") {
    result = result.filter((r) => r.submission.status === statusFilter);
  }
  if (typeFilter) {
    result = result.filter((r) => r.lesson.lessonType === typeFilter);
  }

  return NextResponse.json({ submissions: result });
}
