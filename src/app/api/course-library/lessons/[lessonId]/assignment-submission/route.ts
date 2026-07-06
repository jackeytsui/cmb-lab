import { NextRequest, NextResponse } from "next/server";
import { asc, and, eq, isNull } from "drizzle-orm";
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
import type { CourseLibraryTextAssignmentContent } from "@/db/schema/course-library";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

// Statuses in which the student may still create/replace their submission.
const EDITABLE_STATUSES = ["draft", "submitted"] as const;

const sentenceSchema = z.object({
  promptId: z.string().min(1).max(100),
  chineseText: z.string().min(1).max(2000),
  pinyin: z.string().max(4000).default(""),
  english: z.string().min(1).max(4000),
});

const submitSchema = z.object({
  sentences: z.array(sentenceSchema).min(1).max(50),
});

async function getPublishedTextAssignmentLesson(lessonId: string) {
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
        eq(courseLibraryCourses.isPublished, true),
      ),
    )
    .limit(1);

  if (!row || row.lessonType !== "text_assignment") return null;
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
 * GET /api/course-library/lessons/[lessonId]/assignment-submission
 * The current student's own submission (with sentences) for this lesson.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const lesson = await getPublishedTextAssignmentLesson(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const submission = await loadSubmissionWithSentences(lessonId, user.id);
  return NextResponse.json({ submission });
}

/**
 * PUT /api/course-library/lessons/[lessonId]/assignment-submission
 * Create or replace the student's submission (submit / resubmit).
 * Rejected once a reviewer has been assigned or review has started/finished.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const lesson = await getPublishedTextAssignmentLesson(lessonId);
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

  // Every configured sentence prompt must be answered, and answers must map
  // 1:1 onto configured prompts.
  const content = (lesson.content ?? {}) as CourseLibraryTextAssignmentContent;
  const prompts = Array.isArray(content.sentencePrompts)
    ? [...content.sentencePrompts].sort((a, b) => a.order - b.order)
    : [];
  if (prompts.length === 0) {
    return NextResponse.json(
      { error: "This assignment has no sentence prompts configured yet." },
      { status: 400 },
    );
  }

  const answersByPrompt = new Map(
    parsed.data.sentences.map((s) => [s.promptId, s]),
  );
  if (answersByPrompt.size !== parsed.data.sentences.length) {
    return NextResponse.json(
      { error: "Duplicate sentence prompt answers" },
      { status: 400 },
    );
  }
  const missing = prompts.filter((p) => !answersByPrompt.has(p.id));
  const unknown = parsed.data.sentences.filter(
    (s) => !prompts.some((p) => p.id === s.promptId),
  );
  if (missing.length > 0 || unknown.length > 0) {
    return NextResponse.json(
      { error: "Answers must cover every sentence prompt in this assignment." },
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
  let submissionId: string;

  if (existing) {
    submissionId = existing.id;
    await db
      .update(assignmentSubmissions)
      .set({
        status: "submitted",
        submittedAt: now,
        moduleId: lesson.moduleId,
        courseId: lesson.courseId,
      })
      .where(eq(assignmentSubmissions.id, existing.id));
    // Replace sentences wholesale — corrections only exist after review
    // starts, at which point edits are already locked out above.
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
        assignmentType: "text_assignment",
        status: "submitted",
        submittedAt: now,
      })
      .returning({ id: assignmentSubmissions.id });
    submissionId = created.id;
  }

  await db.insert(assignmentSubmissionSentences).values(
    prompts.map((prompt, idx) => {
      const answer = answersByPrompt.get(prompt.id)!;
      return {
        submissionId,
        promptId: prompt.id,
        sortOrder: idx,
        promptLabel: prompt.label ?? "",
        promptDescription: prompt.description ?? "",
        chineseText: answer.chineseText,
        generatedPinyin: answer.pinyin,
        generatedEnglish: answer.english,
      };
    }),
  );

  // Submitting the assignment counts as completing the lesson.
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
