import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  assignmentSubmissions,
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  users,
} from "@/db/schema";
import { getAnyAssignmentReviewer } from "@/lib/assignment-review";

const STATUSES = ["submitted", "assigned", "in_review", "reviewed"] as const;
const TYPES = ["text_assignment", "vocal_hack"] as const;

/**
 * GET /api/admin/assignment-submissions
 * Submissions dashboard list for admins / Challenge Reviewers.
 * Query params: tab=all|assigned, status, type, reviewerId, courseId
 */
export async function GET(request: NextRequest) {
  const reviewerUser = await getAnyAssignmentReviewer();
  if (!reviewerUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "assigned" ? "assigned" : "all";
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const reviewerId = searchParams.get("reviewerId");
  const courseId = searchParams.get("courseId");

  const student = alias(users, "student");
  const assignedReviewer = alias(users, "assigned_reviewer");

  const conditions: SQL[] = [ne(assignmentSubmissions.status, "draft")];
  if (tab === "assigned") {
    conditions.push(
      eq(assignmentSubmissions.assignedReviewerId, reviewerUser.id),
    );
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    conditions.push(
      eq(
        assignmentSubmissions.status,
        status as (typeof STATUSES)[number],
      ),
    );
  }
  if (type && (TYPES as readonly string[]).includes(type)) {
    conditions.push(
      eq(
        assignmentSubmissions.assignmentType,
        type as (typeof TYPES)[number],
      ),
    );
  }
  if (reviewerId) {
    conditions.push(eq(assignmentSubmissions.assignedReviewerId, reviewerId));
  }
  if (courseId) {
    conditions.push(eq(courseLibraryCourses.id, courseId));
  }

  const rows = await db
    .select({
      id: assignmentSubmissions.id,
      status: assignmentSubmissions.status,
      assignmentType: assignmentSubmissions.assignmentType,
      submittedAt: assignmentSubmissions.submittedAt,
      reviewedAt: assignmentSubmissions.reviewedAt,
      autoScore: assignmentSubmissions.autoScore,
      finalScore: assignmentSubmissions.finalScore,
      assignedReviewerId: assignmentSubmissions.assignedReviewerId,
      studentId: assignmentSubmissions.studentId,
      studentName: student.name,
      studentEmail: student.email,
      assignedReviewerName: assignedReviewer.name,
      assignedReviewerEmail: assignedReviewer.email,
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      moduleTitle: courseLibraryModules.title,
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
    })
    .from(assignmentSubmissions)
    .innerJoin(student, eq(assignmentSubmissions.studentId, student.id))
    .leftJoin(
      assignedReviewer,
      eq(assignmentSubmissions.assignedReviewerId, assignedReviewer.id),
    )
    .innerJoin(
      courseLibraryLessons,
      eq(assignmentSubmissions.lessonId, courseLibraryLessons.id),
    )
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(and(...conditions))
    .orderBy(desc(assignmentSubmissions.submittedAt))
    .limit(500);

  return NextResponse.json({ submissions: rows });
}
