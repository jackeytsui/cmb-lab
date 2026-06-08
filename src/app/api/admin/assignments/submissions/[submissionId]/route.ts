import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessonSubmissions, lessonReviews, lessons, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;

  const submission = await db.query.lessonSubmissions.findFirst({
    where: eq(lessonSubmissions.id, submissionId),
    with: {
      lesson: { columns: { id: true, title: true, lessonType: true, assignmentConfig: true } },
      user: { columns: { id: true, email: true, firstName: true, lastName: true } },
      review: { columns: { reviewData: true, notifiedAt: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    submission: {
      id: submission.id,
      submissionData: submission.submissionData,
      status: submission.status,
      createdAt: submission.createdAt,
    },
    lesson: submission.lesson,
    student: submission.user,
    review: submission.review ?? null,
  });
}
