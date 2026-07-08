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
import type { CourseLibraryVocalHackContent } from "@/db/schema/course-library";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

// Same lifecycle as text assignments: auto-assigned on submit, but the student
// may re-record and resubmit until review actually starts.
const EDITABLE_STATUSES = ["draft", "submitted", "assigned"] as const;

const recordingSchema = z.object({
  sentenceId: z.string().min(1).max(100),
  audioUrl: z.string().url().max(2000),
});

const submitSchema = z.object({
  recordings: z.array(recordingSchema).min(1).max(50),
});

/** Recordings must live in our private blob store (uploaded via upload-audio). */
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

async function getAccessibleVocalHackLesson(lessonId: string, role: string) {
  const [row] = await db
    .select({
      lessonId: courseLibraryLessons.id,
      lessonType: courseLibraryLessons.lessonType,
      content: courseLibraryLessons.content,
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

  if (!row || row.lessonType !== "vocal_hack") return null;
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

/**
 * GET /api/course-library/lessons/[lessonId]/vocal-hack-submission
 * The current student's own submission (with per-sentence recordings).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const lesson = await getAccessibleVocalHackLesson(lessonId, user.role);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const submission = await loadSubmissionWithSentences(lessonId, user.id);
  return NextResponse.json({ submission });
}

/**
 * PUT /api/course-library/lessons/[lessonId]/vocal-hack-submission
 * Create or replace the student's submission (submit / resubmit).
 * Every configured sentence must have a recording. Rejected once review has
 * started or finished.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const lesson = await getAccessibleVocalHackLesson(lessonId, user.role);
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
  for (const recording of parsed.data.recordings) {
    if (!isOwnBlobUrl(recording.audioUrl)) {
      return NextResponse.json(
        { error: "Recordings must be uploaded through the recorder." },
        { status: 400 },
      );
    }
  }

  const content = (lesson.content ?? {}) as CourseLibraryVocalHackContent;
  const configured = Array.isArray(content.sentences)
    ? [...content.sentences].sort((a, b) => a.order - b.order)
    : [];
  if (configured.length === 0) {
    return NextResponse.json(
      { error: "This Vocal Hack has no sentences configured yet." },
      { status: 400 },
    );
  }

  const recordingsBySentence = new Map(
    parsed.data.recordings.map((r) => [r.sentenceId, r]),
  );
  if (recordingsBySentence.size !== parsed.data.recordings.length) {
    return NextResponse.json(
      { error: "Duplicate sentence recordings" },
      { status: 400 },
    );
  }
  const missing = configured.filter((s) => !recordingsBySentence.has(s.id));
  const unknown = parsed.data.recordings.filter(
    (r) => !configured.some((s) => s.id === r.sentenceId),
  );
  if (missing.length > 0 || unknown.length > 0) {
    return NextResponse.json(
      { error: "Please record every sentence before submitting." },
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

  // Auto-assign to a Vocal Hack Reviewer on submit; keep an existing assignee.
  const reviewers = await listChallengeReviewers("vocal_hack");
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
        assignmentType: "vocal_hack",
        status,
        assignedReviewerId,
        submittedAt: now,
      })
      .returning({ id: assignmentSubmissions.id });
    submissionId = created.id;
  }

  // Snapshot each sentence's text/pinyin/English so feedback stays stable if
  // the admin later edits the lesson.
  await db.insert(assignmentSubmissionSentences).values(
    configured.map((sentence, idx) => {
      const recording = recordingsBySentence.get(sentence.id)!;
      return {
        submissionId,
        promptId: sentence.id,
        sortOrder: idx,
        promptLabel: `Sentence ${idx + 1}`,
        promptDescription: "",
        chineseText: sentence.chinese,
        generatedPinyin: sentence.pinyin ?? "",
        generatedEnglish: sentence.english ?? "",
        audioUrl: recording.audioUrl,
      };
    }),
  );

  // Submitting counts as completing the lesson.
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
