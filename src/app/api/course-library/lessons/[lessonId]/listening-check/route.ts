import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryModules,
  courseLibraryCourses,
  courseLibraryLessonProgress,
  users,
} from "@/db/schema";
import type { CourseLibraryListeningPracticeSentence } from "@/db/schema/course-library";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { romanisationMatches } from "@/lib/pinyin-normalize";
import { isListeningPracticeLesson, lessonLanguage } from "@/lib/lesson-language";
import { convertScript } from "@/lib/chinese-convert";

// ---------------------------------------------------------------------------
// POST /api/course-library/lessons/[lessonId]/listening-check
//
// Auto-checks one sentence of a Listening Practice lesson. The model answer
// never leaves the server unless earned: the revealed pinyin is returned only
// when the student is correct or gives up.
//
// Grading is authoritative (server compares against the stored model answer)
// and persisted incrementally into course_library_lesson_progress:
//   quiz_answers = { [sentenceId]: { status, attempts } }
//   quiz_score   = round(correct / totalSentences * 100)
//   completed_at = set once every sentence is resolved (correct or gaveup)
// ---------------------------------------------------------------------------

type SentenceStatus = "correct" | "incorrect" | "gaveup";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

const bodySchema = z.object({
  sentenceId: z.string().min(1),
  answer: z.string().max(200).optional(),
  giveUp: z.boolean().optional(),
  // "guided" (default): romanisation answers only, text is shown.
  // "mastery": audio only — Chinese characters are also accepted as answers.
  mode: z.enum(["guided", "mastery"]).optional(),
});

/**
 * True when the submitted characters match the sentence (Mastery mode).
 * Both sides are normalised: converted to Simplified (so Traditional and
 * Simplified submissions are equally valid) and stripped to Han characters
 * only, so punctuation and spacing never matter. Submissions with no Han
 * characters never match.
 */
async function chineseAnswerMatches(
  submission: string,
  modelChinese: string,
): Promise<boolean> {
  const hanOnly = (text: string) => text.replace(/[^\p{Script=Han}]/gu, "");
  const submittedHan = hanOnly(submission);
  if (!submittedHan) return false;
  const [submittedSimplified, modelSimplified] = await Promise.all([
    convertScript(submittedHan, "traditional", "simplified"),
    convertScript(hanOnly(modelChinese), "traditional", "simplified"),
  ]);
  return submittedSimplified === modelSimplified;
}

async function getCourseLibraryUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true },
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCourseLibraryUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const [lesson] = await db
    .select({
      content: courseLibraryLessons.content,
      lessonType: courseLibraryLessons.lessonType,
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
        inArray(courseLibraryCourses.status, visibleCourseStatuses(user.role)),
      ),
    )
    .limit(1);

  if (!lesson || !isListeningPracticeLesson(lesson.lessonType)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const content = (lesson.content ?? {}) as Record<string, unknown>;
  const sentences = Array.isArray(content.sentences)
    ? (content.sentences as CourseLibraryListeningPracticeSentence[])
    : [];
  const total = sentences.length;
  const sentence = sentences.find((s) => s.id === parsed.data.sentenceId);
  if (!sentence) {
    return NextResponse.json({ error: "Sentence not found" }, { status: 404 });
  }

  const giveUp = parsed.data.giveUp === true;
  const answer = parsed.data.answer ?? "";
  const isMastery = parsed.data.mode === "mastery";
  // Guided: romanisation only (the characters are on screen, so accepting them
  // would be a copy-paste pass). Mastery: romanisation OR the characters
  // themselves, Traditional or Simplified.
  const correct =
    !giveUp &&
    (romanisationMatches(
      answer,
      sentence.pinyin,
      lessonLanguage(lesson.lessonType),
    ) ||
      (isMastery && (await chineseAnswerMatches(answer, sentence.chinese))));
  const status: SentenceStatus = correct
    ? "correct"
    : giveUp
      ? "gaveup"
      : "incorrect";
  const revealed = correct || giveUp;

  // Merge into existing per-sentence results.
  const existing = await db.query.courseLibraryLessonProgress.findFirst({
    where: and(
      eq(courseLibraryLessonProgress.userId, user.id),
      eq(courseLibraryLessonProgress.lessonId, lessonId),
    ),
  });

  const priorAnswers =
    (existing?.quizAnswers as Record<
      string,
      { status: SentenceStatus; attempts: number }
    > | null) ?? {};
  const prior = priorAnswers[sentence.id];
  // Don't let a later "incorrect" clobber an already-resolved sentence.
  const alreadyResolved =
    prior && (prior.status === "correct" || prior.status === "gaveup");
  const nextEntry = alreadyResolved
    ? prior
    : { status, attempts: (prior?.attempts ?? 0) + 1 };
  const nextAnswers = { ...priorAnswers, [sentence.id]: nextEntry };

  // Score from resolved sentences that still exist in the lesson.
  const validIds = new Set(sentences.map((s) => s.id));
  let correctCount = 0;
  let resolvedCount = 0;
  for (const id of validIds) {
    const entry = nextAnswers[id];
    if (!entry) continue;
    if (entry.status === "correct") {
      correctCount += 1;
      resolvedCount += 1;
    } else if (entry.status === "gaveup") {
      resolvedCount += 1;
    }
  }
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const allResolved = total > 0 && resolvedCount >= total;

  await db
    .insert(courseLibraryLessonProgress)
    .values({
      userId: user.id,
      lessonId,
      quizAnswers: nextAnswers,
      quizScore: score,
      completedAt: allResolved ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [
        courseLibraryLessonProgress.userId,
        courseLibraryLessonProgress.lessonId,
      ],
      set: {
        quizAnswers: nextAnswers,
        quizScore: score,
        ...(allResolved ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({
    correct,
    status,
    // Revealed model answer only when earned (correct or gave up).
    pinyin: revealed ? sentence.pinyin : undefined,
    score,
    correctCount,
    resolvedCount,
    total,
    allResolved,
  });
}
