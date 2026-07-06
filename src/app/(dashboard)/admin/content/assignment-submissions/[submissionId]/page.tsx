import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentCorrections,
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  users,
} from "@/db/schema";
import { getAssignmentReviewer } from "@/lib/assignment-review";
import { ReviewClient, type ReviewSubmissionDto } from "./ReviewClient";

interface PageProps {
  params: Promise<{ submissionId: string }>;
}

export default async function AssignmentReviewPage({ params }: PageProps) {
  const reviewer = await getAssignmentReviewer();
  if (!reviewer) redirect("/dashboard");

  const { submissionId } = await params;

  const [row] = await db
    .select({
      submission: assignmentSubmissions,
      studentName: users.name,
      studentEmail: users.email,
      lessonTitle: courseLibraryLessons.title,
      lessonContent: courseLibraryLessons.content,
      moduleTitle: courseLibraryModules.title,
      courseTitle: courseLibraryCourses.title,
    })
    .from(assignmentSubmissions)
    .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
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
    .where(eq(assignmentSubmissions.id, submissionId))
    .limit(1);

  if (!row || row.submission.status === "draft") notFound();

  // Opening the review interface starts the review, which locks the student
  // out of editing their submission.
  if (
    row.submission.status === "submitted" ||
    row.submission.status === "assigned"
  ) {
    await db
      .update(assignmentSubmissions)
      .set({ status: "in_review", reviewStartedAt: new Date() })
      .where(eq(assignmentSubmissions.id, submissionId));
    row.submission.status = "in_review";
  }

  const sentences = await db.query.assignmentSubmissionSentences.findMany({
    where: eq(assignmentSubmissionSentences.submissionId, submissionId),
    orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
  });
  const corrections = sentences.length
    ? await db.query.assignmentCorrections.findMany({
        where: inArray(
          assignmentCorrections.sentenceId,
          sentences.map((s) => s.id),
        ),
        orderBy: [asc(assignmentCorrections.startOffset)],
      })
    : [];

  const lessonContent = (row.lessonContent ?? {}) as Record<string, unknown>;

  const dto: ReviewSubmissionDto = {
    id: row.submission.id,
    status: row.submission.status,
    submittedAt: row.submission.submittedAt?.toISOString() ?? null,
    reviewedAt: row.submission.reviewedAt?.toISOString() ?? null,
    autoScore: row.submission.autoScore,
    finalScore: row.submission.finalScore,
    scoreOverridden: row.submission.scoreOverridden,
    recordingUrl: row.submission.recordingUrl,
    extraComment: row.submission.extraComment,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    lessonTitle: row.lessonTitle,
    moduleTitle: row.moduleTitle,
    courseTitle: row.courseTitle,
    assignmentDescription:
      typeof lessonContent.description === "string"
        ? lessonContent.description
        : "",
    sentences: sentences.map((sentence) => ({
      id: sentence.id,
      promptLabel: sentence.promptLabel,
      promptDescription: sentence.promptDescription,
      chineseText: sentence.chineseText,
      generatedPinyin: sentence.generatedPinyin,
      generatedEnglish: sentence.generatedEnglish,
      reviewVerdict: sentence.reviewVerdict,
      corrections: corrections
        .filter((c) => c.sentenceId === sentence.id)
        .map((c) => ({
          id: c.id,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          originalText: c.originalText,
          suggestedChinese: c.suggestedChinese,
          suggestedPinyin: c.suggestedPinyin,
          suggestedEnglish: c.suggestedEnglish,
        })),
    })),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link
        href="/admin/content/assignment-submissions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Submissions
      </Link>
      <ReviewClient submission={dto} />
    </div>
  );
}
