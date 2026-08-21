import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons, lessonSubmissions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  isAssignmentType,
  normalizePinyin,
  type SubmissionData,
} from "@/lib/assignment-types";
import { getRealUser } from "@/lib/auth";
import { canAccessLesson, resolvePermissions } from "@/lib/permissions";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

const bodySchema = z.object({
  submissionData: z.string().min(1).max(100_000), // JSON string
}).strict();

const challengeSubmissionSchema = z.object({
  sentences: z.array(z.string().max(2_000)).min(1).max(9),
}).strict();

const listeningSubmissionSchema = z.object({
  answers: z.array(z.object({
    index: z.number().int().min(0),
    studentPinyin: z.string().max(500),
    correct: z.boolean(),
    givenUp: z.boolean(),
  }).strict()).min(1).max(200),
}).strict();

const vocalSubmissionSchema = z.object({
  recordings: z.array(z.object({
    index: z.number().int().min(0),
    blobUrl: z.string().url().max(2_000),
  }).strict()).min(1).max(200),
}).strict();

const diarySubmissionSchema = z.object({
  text: z.string().max(20_000),
  audioBlobUrl: z.string().max(2_000),
}).strict();

const listeningConfigSchema = z.object({
  audioBlobUrl: z.string(),
  sentences: z.array(z.object({
    chinese: z.string(),
    expectedPinyin: z.string(),
  })).max(200),
});

function isAssignmentRecordingUrl(value: string): boolean {
  if (!isPrivateVercelBlobUrl(value)) return false;
  try {
    return new URL(value).pathname.includes("assignment-recordings/");
  } catch {
    return false;
  }
}

/**
 * POST /api/assignments/[lessonId]/submit
 * Upsert a student submission for an assignment-type lesson.
 * Forbidden once the submission has been reviewed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const dbUser = await getRealUser();
  if (!dbUser || dbUser.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!z.string().uuid().safeParse(lessonId).success) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  // Verify lesson exists and is an assignment type
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { lessonType: true, assignmentConfig: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (!isAssignmentType(lesson.lessonType)) {
    return NextResponse.json({ error: "Not an assignment lesson" }, { status: 400 });
  }
  if (dbUser.role !== "admin" && dbUser.role !== "coach") {
    const permissions = await resolvePermissions(dbUser.id);
    if (!(await canAccessLesson(permissions, lessonId))) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  let rawSubmission: unknown;
  try {
    rawSubmission = JSON.parse(parsed.data.submissionData);
  } catch {
    return NextResponse.json({ error: "submissionData must be valid JSON" }, { status: 400 });
  }

  let canonicalSubmission: SubmissionData;
  if (lesson.lessonType === "challenge") {
    const submission = challengeSubmissionSchema.safeParse(rawSubmission);
    if (!submission.success || submission.data.sentences.every((text) => !text.trim())) {
      return NextResponse.json({ error: "Invalid challenge submission" }, { status: 400 });
    }
    canonicalSubmission = {
      sentences: submission.data.sentences.map((text) => text.trim()),
    };
  } else if (lesson.lessonType === "listening_practice") {
    const submission = listeningSubmissionSchema.safeParse(rawSubmission);
    let rawConfig: unknown = null;
    try {
      rawConfig = JSON.parse(lesson.assignmentConfig ?? "null");
    } catch {
      // The validation below returns a stable client error for malformed config.
    }
    const config = listeningConfigSchema.safeParse(rawConfig);
    if (!submission.success || !config.success) {
      return NextResponse.json({ error: "Invalid listening submission" }, { status: 400 });
    }
    const uniqueIndexes = new Set(submission.data.answers.map((answer) => answer.index));
    if (
      uniqueIndexes.size !== submission.data.answers.length ||
      submission.data.answers.some((answer) => answer.index >= config.data.sentences.length)
    ) {
      return NextResponse.json({ error: "Invalid listening answers" }, { status: 400 });
    }
    canonicalSubmission = {
      answers: submission.data.answers
        .map((answer) => {
          const expected = config.data.sentences[answer.index].expectedPinyin;
          const correct = normalizePinyin(answer.studentPinyin) === normalizePinyin(expected);
          return {
            index: answer.index,
            studentPinyin: answer.studentPinyin.trim(),
            correct,
            givenUp: correct ? false : answer.givenUp,
          };
        })
        .sort((a, b) => a.index - b.index),
    };
  } else if (lesson.lessonType === "vocal_hack") {
    const submission = vocalSubmissionSchema.safeParse(rawSubmission);
    if (!submission.success) {
      return NextResponse.json({ error: "Invalid vocal submission" }, { status: 400 });
    }
    const indexes = new Set(submission.data.recordings.map((recording) => recording.index));
    if (
      indexes.size !== submission.data.recordings.length ||
      submission.data.recordings.some((recording) => !isAssignmentRecordingUrl(recording.blobUrl))
    ) {
      return NextResponse.json({ error: "Invalid vocal recordings" }, { status: 400 });
    }
    canonicalSubmission = submission.data;
  } else {
    const submission = diarySubmissionSchema.safeParse(rawSubmission);
    if (
      !submission.success ||
      (!submission.data.text.trim() && !submission.data.audioBlobUrl) ||
      (submission.data.audioBlobUrl && !isAssignmentRecordingUrl(submission.data.audioBlobUrl))
    ) {
      return NextResponse.json({ error: "Invalid diary submission" }, { status: 400 });
    }
    canonicalSubmission = {
      text: submission.data.text.trim(),
      audioBlobUrl: submission.data.audioBlobUrl,
    };
  }

  const canonicalSubmissionData = JSON.stringify(canonicalSubmission);

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
      submissionData: canonicalSubmissionData,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [lessonSubmissions.lessonId, lessonSubmissions.userId],
      set: {
        submissionData: canonicalSubmissionData,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ submission });
}
