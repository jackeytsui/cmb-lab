import { NextRequest, NextResponse } from "next/server";
import { asc, and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assignmentSubmissions,
  assignmentSubmissionSentences,
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { listChallengeReviewers } from "@/lib/assignment-review";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

const EDITABLE_STATUSES = ["draft", "submitted", "assigned"] as const;

const sentenceSchema = z.object({
  chineseText: z.string().min(1).max(2000),
  pinyin: z.string().max(4000).default(""),
  english: z.string().max(4000).default(""),
});

const submitSchema = z.object({
  sentences: z.array(sentenceSchema).min(1).max(100),
  audioUrl: z.string().url().max(2000),
});

/** Recordings must live in our private blob store (uploaded via the recorder). */
function isOwnBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".blob.vercel-storage.com") &&
      parsed.pathname.includes("assignment-recordings/")
    );
  } catch {
    return false;
  }
}

async function getAccessibleDiaryLesson(lessonId: string, role: string) {
  const [row] = await db
    .select({
      lessonId: courseLibraryLessons.id,
      lessonType: courseLibraryLessons.lessonType,
      moduleId: courseLibraryModules.id,
      courseId: courseLibraryCourses.id,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(courseLibraryCourses.status, visibleCourseStatuses(role)),
      ),
    )
    .limit(1);

  if (!row || row.lessonType !== "diary") return null;
  return row;
}

async function loadSubmissionWithSentences(lessonId: string, studentId: string) {
  const submission = await db.query.assignmentSubmissions.findFirst({
    where: and(
      eq(assignmentSubmissions.lessonId, lessonId),
      eq(assignmentSubmissions.studentId, studentId),
    ),
  });
  if (!submission) return null;
  const sentences = await db.query.assignmentSubmissionSentences.findMany({
    where: eq(assignmentSubmissionSentences.submissionId, submission.id),
    orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
  });
  return { ...submission, sentences };
}

/** GET the current student's own diary submission. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lessonId } = await params;
  const lesson = await getAccessibleDiaryLesson(lessonId, user.role);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  const submission = await loadSubmissionWithSentences(lessonId, user.id);
  return NextResponse.json({ submission });
}

/**
 * PUT: create or replace the student's diary submission (submit / resubmit).
 * The client segments the paragraph into sentences and generates
 * pinyin/English (same pipeline as Text Assignment). Both a written entry and
 * a recording are required. Rejected once review has started or finished.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lessonId } = await params;
  const lesson = await getAccessibleDiaryLesson(lessonId, user.role);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!isOwnBlobUrl(parsed.data.audioUrl)) {
    return NextResponse.json(
      { error: "Recording must be uploaded through the recorder." },
      { status: 400 },
    );
  }

  const existing = await db.query.assignmentSubmissions.findFirst({
    where: and(
      eq(assignmentSubmissions.lessonId, lessonId),
      eq(assignmentSubmissions.studentId, user.id),
    ),
  });
  if (
    existing &&
    !EDITABLE_STATUSES.includes(
      existing.status as (typeof EDITABLE_STATUSES)[number],
    )
  ) {
    return NextResponse.json(
      { error: "This submission is being reviewed and can no longer be edited." },
      { status: 409 },
    );
  }

  const now = new Date();
  const reviewers = await listChallengeReviewers("diary");
  const assignedReviewerId =
    existing?.assignedReviewerId ?? reviewers[0]?.id ?? null;
  const status = assignedReviewerId ? "assigned" : "submitted";

  let submissionId: string;
  if (existing) {
    submissionId = existing.id;
    await db
      .update(assignmentSubmissions)
      .set({
        status,
        assignedReviewerId,
        submittedAt: now,
        moduleId: lesson.moduleId,
        courseId: lesson.courseId,
        studentAudioUrl: parsed.data.audioUrl,
      })
      .where(eq(assignmentSubmissions.id, existing.id));
    await db
      .delete(assignmentSubmissionSentences)
      .where(eq(assignmentSubmissionSentences.submissionId, existing.id));
  } else {
    const [created] = await db
      .insert(assignmentSubmissions)
      .values({
        lessonId,
        moduleId: lesson.moduleId,
        courseId: lesson.courseId,
        studentId: user.id,
        assignmentType: "diary",
        status,
        assignedReviewerId,
        submittedAt: now,
        studentAudioUrl: parsed.data.audioUrl,
      })
      .returning({ id: assignmentSubmissions.id });
    submissionId = created.id;
  }

  await db.insert(assignmentSubmissionSentences).values(
    parsed.data.sentences.map((sentence, idx) => ({
      submissionId,
      promptId: `line-${idx}`,
      sortOrder: idx,
      promptLabel: "",
      promptDescription: "",
      chineseText: sentence.chineseText,
      generatedPinyin: sentence.pinyin,
      generatedEnglish: sentence.english,
    })),
  );

  await db
    .insert(courseLibraryLessonProgress)
    .values({ userId: user.id, lessonId, completedAt: now })
    .onConflictDoUpdate({
      target: [
        courseLibraryLessonProgress.userId,
        courseLibraryLessonProgress.lessonId,
      ],
      set: { completedAt: now, updatedAt: now },
    });

  const submission = await loadSubmissionWithSentences(lessonId, user.id);
  return NextResponse.json({ submission });
}
