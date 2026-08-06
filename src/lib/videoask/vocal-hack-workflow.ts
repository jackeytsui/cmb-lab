import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonTypeEnum,
  courseLibraryLessons,
  courseLibraryModules,
  videoaskFormImports,
  videoaskMediaImports,
  videoaskStepImports,
  videoaskVocalHackPlacements,
  videoaskVocalHackSentences,
} from "@/db/schema";
import { smartRomanise } from "@/lib/romanise";
import { buildVocalHackPlacementPreview } from "./vocal-hack-preview";

export const DEFAULT_VOCAL_HACK_INSTRUCTIONS =
  "<p>Watch each coach video, then record yourself imitating the sentence as closely as you can. Submit all recordings for personalized feedback from our coaching team.</p>";

const MAX_TRANSCRIPTION_ATTEMPTS = 4;
const STALE_TRANSCRIPTION_MS = 10 * 60 * 1_000;
const PLACEMENT_WRITE_CONCURRENCY = 8;
const SENTENCE_INSERT_CHUNK = 100;

const cleanedTranscriptSchema = z.object({
  chinese: z
    .string()
    .describe("The single Chinese sentence spoken by the coach, without repetition"),
  english: z.string().describe("A concise natural English translation"),
});

const destinationSnapshotSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("replaced"),
    publishedContent: z.record(z.string(), z.unknown()),
    lesson: z.object({
      id: z.string().uuid(),
      moduleId: z.string().uuid(),
      title: z.string(),
      lessonType: z.enum(courseLibraryLessonTypeEnum.enumValues),
      content: z.record(z.string(), z.unknown()),
      sortOrder: z.number().int(),
    }),
  }),
  z.object({
    kind: z.literal("created"),
    publishedContent: z.record(z.string(), z.unknown()),
  }),
]);

type PlacementPreview = Awaited<
  ReturnType<typeof buildVocalHackPlacementPreview>
>["forms"][number];

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function placementValues(form: PlacementPreview) {
  return {
    formImportId: form.formImportId,
    sourceGroup: form.sourceGroup,
    language: form.language,
    targetCourseId: form.targetCourse?.id ?? null,
    targetModuleId: form.targetModule?.id ?? null,
    targetLessonId: form.targetLesson?.id ?? null,
    targetLessonTitle: form.targetLessonTitle,
    action: form.action,
    confidence: form.confidence,
    matchScore: Math.round(form.score * 1_000),
    mappingReason: form.reason,
    instructions: DEFAULT_VOCAL_HACK_INSTRUCTIONS,
    totalSentences: form.stepCount,
    lastError: form.mediaComplete
      ? null
      : `Only ${form.mediaReady}/${form.stepCount} source media files are ready`,
  };
}

/**
 * Create review-only staging rows. No Course Library lesson is inserted or
 * modified here, even when its destination course is already published.
 */
export async function prepareVocalHackPlacements(input?: {
  formImportIds?: string[];
}) {
  const preview = await buildVocalHackPlacementPreview();
  const requestedFormIds = input?.formImportIds
    ? new Set(input.formImportIds)
    : null;
  const forms = requestedFormIds
    ? preview.forms.filter((form) => requestedFormIds.has(form.formImportId))
    : preview.forms;
  const formIds = forms.map((form) => form.formImportId);
  const existing =
    formIds.length > 0
      ? await db
          .select()
          .from(videoaskVocalHackPlacements)
          .where(inArray(videoaskVocalHackPlacements.formImportId, formIds))
      : [];
  const existingByForm = new Map(
    existing.map((placement) => [placement.formImportId, placement]),
  );

  const placements = await mapWithConcurrency(
    forms,
    PLACEMENT_WRITE_CONCURRENCY,
    async (form) => {
      const previous = existingByForm.get(form.formImportId);
      const values = placementValues(form);
      if (!previous) {
        const [created] = await db
          .insert(videoaskVocalHackPlacements)
          .values(values)
          .onConflictDoNothing({
            target: videoaskVocalHackPlacements.formImportId,
          })
          .returning();
        if (created) return created;
        const [concurrent] = await db
          .select()
          .from(videoaskVocalHackPlacements)
          .where(eq(videoaskVocalHackPlacements.formImportId, form.formImportId))
          .limit(1);
        if (!concurrent) {
          throw new Error(`Could not stage ${form.sourceTitle}`);
        }
        return concurrent;
      }

      // Once an administrator starts reviewing/approving a placement, refresh
      // source counts without overwriting their destination choice.
      const editableSuggestion =
        previous.status === "planned" && previous.approvedAt === null;
      const [updated] = await db
        .update(videoaskVocalHackPlacements)
        .set(
          editableSuggestion
            ? { ...values, updatedAt: new Date() }
            : {
                sourceGroup: form.sourceGroup,
                language: form.language,
                totalSentences: form.stepCount,
                updatedAt: new Date(),
              },
        )
        .where(eq(videoaskVocalHackPlacements.id, previous.id))
        .returning();
      return updated;
    },
  );

  const placementByForm = new Map(
    placements.map((placement) => [placement.formImportId, placement]),
  );
  const sourceSteps =
    formIds.length > 0
      ? await db
          .select({
            formImportId: videoaskStepImports.formImportId,
            stepImportId: videoaskStepImports.id,
            sortOrder: videoaskStepImports.sortOrder,
            sourcePromptText: videoaskStepImports.sourcePromptText,
            sourceTranscript: videoaskStepImports.sourceTranscript,
            durableVideoUrl: videoaskMediaImports.destinationUrl,
          })
          .from(videoaskStepImports)
          .leftJoin(
            videoaskMediaImports,
            eq(videoaskMediaImports.id, videoaskStepImports.mediaImportId),
          )
          .where(inArray(videoaskStepImports.formImportId, formIds))
          .orderBy(
            asc(videoaskStepImports.formImportId),
            asc(videoaskStepImports.sortOrder),
          )
      : [];

  const sentenceValues = sourceSteps.flatMap((step) => {
    const placement = placementByForm.get(step.formImportId);
    const videoUrl = step.durableVideoUrl;
    if (!placement || !videoUrl) return [];
    return [
      {
        placementId: placement.id,
        stepImportId: step.stepImportId,
        sortOrder: step.sortOrder,
        videoUrl,
        sourcePromptText: step.sourcePromptText,
        sourceTranscript: step.sourceTranscript,
        status: "held",
      },
    ];
  });

  for (const values of chunked(sentenceValues, SENTENCE_INSERT_CHUNK)) {
    await db
      .insert(videoaskVocalHackSentences)
      .values(values)
      .onConflictDoUpdate({
        target: videoaskVocalHackSentences.stepImportId,
        set: {
          placementId: sql`excluded.placement_id`,
          sortOrder: sql`excluded.sort_order`,
          videoUrl: sql`excluded.video_url`,
          sourcePromptText: sql`excluded.source_prompt_text`,
          sourceTranscript: sql`excluded.source_transcript`,
          updatedAt: new Date(),
        },
      });
  }

  return {
    placements: placements.length,
    sentences: sentenceValues.length,
    manual: placements.filter((placement) => placement.action === "manual")
      .length,
    missingMedia:
      forms.reduce((total, form) => total + form.stepCount, 0) -
      sentenceValues.length,
  };
}

export async function queueVocalHackTranscription(input?: {
  mode?: "safe" | "all_mapped";
  placementIds?: string[];
}) {
  const conditions = [
    inArray(videoaskVocalHackPlacements.status, ["planned", "transcribing"]),
    sql`${videoaskVocalHackPlacements.targetModuleId} is not null`,
  ];
  if (input?.placementIds?.length) {
    conditions.push(
      inArray(videoaskVocalHackPlacements.id, input.placementIds),
    );
  } else if ((input?.mode ?? "safe") === "safe") {
    conditions.push(
      inArray(videoaskVocalHackPlacements.confidence, ["exact", "high"]),
    );
  }

  const placements = await db
    .select({ id: videoaskVocalHackPlacements.id })
    .from(videoaskVocalHackPlacements)
    .where(and(...conditions));
  const placementIds = placements.map((placement) => placement.id);
  if (placementIds.length === 0) {
    return { placements: 0, sentences: 0 };
  }

  const queued = await db
    .update(videoaskVocalHackSentences)
    .set({
      status: "pending",
      attempts: 0,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(videoaskVocalHackSentences.placementId, placementIds),
        inArray(videoaskVocalHackSentences.status, ["held", "failed"]),
      ),
    )
    .returning({ id: videoaskVocalHackSentences.id });

  await db
    .update(videoaskVocalHackPlacements)
    .set({ status: "transcribing", lastError: null, updatedAt: new Date() })
    .where(inArray(videoaskVocalHackPlacements.id, placementIds));

  return { placements: placementIds.length, sentences: queued.length };
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "mp4";
}

function hasHanCharacters(value: string) {
  return /\p{Script=Han}/u.test(value);
}

async function transcribeCoachVideo(input: {
  videoUrl: string;
  language: "mandarin" | "cantonese";
  formTitle: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

  const mediaResponse = await fetch(input.videoUrl, {
    headers: { Authorization: `Bearer ${blobToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!mediaResponse.ok) {
    throw new Error(`Could not read coach video (${mediaResponse.status})`);
  }
  const contentType =
    mediaResponse.headers.get("content-type")?.split(";", 1)[0] ??
    "video/mp4";
  const media = await mediaResponse.blob();
  const formData = new FormData();
  formData.append(
    "file",
    new File(
      [media],
      `coach-sentence.${extensionForContentType(contentType)}`,
      { type: contentType },
    ),
  );
  formData.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe",
  );
  formData.append("language", "zh");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    input.language === "cantonese"
      ? "請用繁體中文準確轉寫教練說的廣東話句子。同一句重複示範時，只寫一次。"
      : "请用简体中文准确转写教练说的普通话句子。同一句重复示范时，只写一次。",
  );

  const transcriptionResponse = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(50_000),
    },
  );
  const transcriptionPayload = (await transcriptionResponse
    .json()
    .catch(() => null)) as { text?: string; error?: { message?: string } } | null;
  if (!transcriptionResponse.ok || !transcriptionPayload?.text?.trim()) {
    throw new Error(
      transcriptionPayload?.error?.message ||
        `AI transcription failed (${transcriptionResponse.status})`,
    );
  }
  const rawTranscript = transcriptionPayload.text.trim();

  const languageLabel =
    input.language === "cantonese" ? "Cantonese" : "Mandarin";
  const scriptInstruction =
    input.language === "cantonese"
      ? "Use natural Traditional Chinese characters and Cantonese wording."
      : "Use natural Simplified Chinese characters and standard Mandarin wording.";
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: cleanedTranscriptSchema,
    system:
      `You clean transcripts for a Chinese pronunciation course. ` +
      `The clip demonstrates exactly one ${languageLabel} sentence, sometimes ` +
      `repeated twice. Keep one faithful copy of the taught sentence, remove ` +
      `fillers and duplicate repetitions, and translate it concisely. ` +
      scriptInstruction,
    prompt: `Course item: ${input.formTitle}\nRaw transcript: ${rawTranscript}`,
  });
  const chinese = object.chinese.trim();
  const english = object.english.trim();
  if (!chinese || !hasHanCharacters(chinese)) {
    throw new Error("AI did not return a usable Chinese sentence");
  }
  return {
    rawTranscript,
    chinese,
    pinyin: smartRomanise(chinese, input.language),
    english,
  };
}

async function refreshPlacementProgress(placementId: string) {
  const [stats] = await db
    .select({
      total: count(),
      ready: sql<number>`count(*) filter (where ${videoaskVocalHackSentences.status} = 'ready')`,
      failed: sql<number>`count(*) filter (where ${videoaskVocalHackSentences.status} = 'failed')`,
      active: sql<number>`count(*) filter (where ${videoaskVocalHackSentences.status} in ('pending', 'processing'))`,
    })
    .from(videoaskVocalHackSentences)
    .where(eq(videoaskVocalHackSentences.placementId, placementId));
  const total = Number(stats?.total ?? 0);
  const ready = Number(stats?.ready ?? 0);
  const failed = Number(stats?.failed ?? 0);
  const active = Number(stats?.active ?? 0);
  const status =
    total > 0 && ready === total
      ? "ready_for_review"
      : active > 0 || failed > 0
        ? "transcribing"
        : "planned";
  await db
    .update(videoaskVocalHackPlacements)
    .set({
      totalSentences: total,
      readySentences: ready,
      status,
      lastError:
        failed > 0 ? `${failed} sentence transcription(s) need retry` : null,
      updatedAt: new Date(),
    })
    .where(eq(videoaskVocalHackPlacements.id, placementId));
  return { total, ready, failed, active };
}

export async function processNextVocalHackSentence(placementId?: string) {
  const staleBefore = new Date(Date.now() - STALE_TRANSCRIPTION_MS);
  const processConditions = [
    eq(videoaskVocalHackPlacements.status, "transcribing"),
    or(
      and(
        inArray(videoaskVocalHackSentences.status, ["pending", "failed"]),
        lt(videoaskVocalHackSentences.attempts, MAX_TRANSCRIPTION_ATTEMPTS),
      ),
      and(
        eq(videoaskVocalHackSentences.status, "processing"),
        lt(videoaskVocalHackSentences.updatedAt, staleBefore),
        lt(videoaskVocalHackSentences.attempts, MAX_TRANSCRIPTION_ATTEMPTS),
      ),
    ),
  ];
  if (placementId) {
    processConditions.push(
      eq(videoaskVocalHackSentences.placementId, placementId),
    );
  }
  const [sentence] = await db
    .select({
      id: videoaskVocalHackSentences.id,
      placementId: videoaskVocalHackSentences.placementId,
      videoUrl: videoaskVocalHackSentences.videoUrl,
      attempts: videoaskVocalHackSentences.attempts,
      language: videoaskVocalHackPlacements.language,
      formTitle: videoaskFormImports.sourceFormTitle,
    })
    .from(videoaskVocalHackSentences)
    .innerJoin(
      videoaskVocalHackPlacements,
      eq(
        videoaskVocalHackPlacements.id,
        videoaskVocalHackSentences.placementId,
      ),
    )
    .innerJoin(
      videoaskFormImports,
      eq(
        videoaskFormImports.id,
        videoaskVocalHackPlacements.formImportId,
      ),
    )
    .where(and(...processConditions))
    .orderBy(
      asc(videoaskVocalHackSentences.attempts),
      asc(videoaskVocalHackSentences.createdAt),
    )
    .limit(1);

  if (!sentence) {
    const [remaining] = await db
      .select({ value: count() })
      .from(videoaskVocalHackSentences)
      .where(
        and(
          inArray(videoaskVocalHackSentences.status, [
            "pending",
            "processing",
            "failed",
          ]),
          placementId
            ? eq(videoaskVocalHackSentences.placementId, placementId)
            : undefined,
        ),
      );
    return {
      status: "empty" as const,
      remaining: Number(remaining?.value ?? 0),
    };
  }

  const [claimed] = await db
    .update(videoaskVocalHackSentences)
    .set({
      status: "processing",
      attempts: sentence.attempts + 1,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(videoaskVocalHackSentences.id, sentence.id),
        eq(videoaskVocalHackSentences.attempts, sentence.attempts),
        or(
          inArray(videoaskVocalHackSentences.status, ["pending", "failed"]),
          and(
            eq(videoaskVocalHackSentences.status, "processing"),
            lt(videoaskVocalHackSentences.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: videoaskVocalHackSentences.id });
  // Another admin runner claimed this row between selection and update. Pick
  // the next eligible row instead of paying for the same transcription twice.
  if (!claimed) return processNextVocalHackSentence(placementId);

  try {
    const result = await transcribeCoachVideo({
      videoUrl: sentence.videoUrl,
      language:
        sentence.language === "cantonese" ? "cantonese" : "mandarin",
      formTitle: sentence.formTitle,
    });
    await db
      .update(videoaskVocalHackSentences)
      .set({
        aiTranscript: result.rawTranscript,
        chinese: result.chinese,
        pinyin: result.pinyin,
        english: result.english,
        status: "ready",
        lastError: null,
        transcribedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoaskVocalHackSentences.id, sentence.id));
    const placement = await refreshPlacementProgress(sentence.placementId);
    return {
      status: "ready" as const,
      sentenceId: sentence.id,
      placementId: sentence.placementId,
      placement,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI transcription failed";
    await db
      .update(videoaskVocalHackSentences)
      .set({
        status: "failed",
        lastError: message.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where(eq(videoaskVocalHackSentences.id, sentence.id));
    const placement = await refreshPlacementProgress(sentence.placementId);
    return {
      status: "failed" as const,
      sentenceId: sentence.id,
      placementId: sentence.placementId,
      error: message,
      placement,
    };
  }
}

export async function getVocalHackWorkflowStatus() {
  const [placements, sentenceCounts] = await Promise.all([
    db
      .select({
        id: videoaskVocalHackPlacements.id,
        formImportId: videoaskVocalHackPlacements.formImportId,
        sourceTitle: videoaskFormImports.sourceFormTitle,
        sourceGroup: videoaskVocalHackPlacements.sourceGroup,
        language: videoaskVocalHackPlacements.language,
        status: videoaskVocalHackPlacements.status,
        confidence: videoaskVocalHackPlacements.confidence,
        action: videoaskVocalHackPlacements.action,
        targetCourseId: videoaskVocalHackPlacements.targetCourseId,
        targetCourseTitle: courseLibraryCourses.title,
        targetModuleId: videoaskVocalHackPlacements.targetModuleId,
        targetModuleTitle: courseLibraryModules.title,
        targetLessonId: videoaskVocalHackPlacements.targetLessonId,
        targetLessonTitle: videoaskVocalHackPlacements.targetLessonTitle,
        publishedLessonId: videoaskVocalHackPlacements.publishedLessonId,
        publishedAt: videoaskVocalHackPlacements.publishedAt,
        rolledBackAt: videoaskVocalHackPlacements.rolledBackAt,
        totalSentences: videoaskVocalHackPlacements.totalSentences,
        readySentences: videoaskVocalHackPlacements.readySentences,
        lastError: videoaskVocalHackPlacements.lastError,
        updatedAt: videoaskVocalHackPlacements.updatedAt,
      })
      .from(videoaskVocalHackPlacements)
      .innerJoin(
        videoaskFormImports,
        eq(
          videoaskFormImports.id,
          videoaskVocalHackPlacements.formImportId,
        ),
      )
      .leftJoin(
        courseLibraryCourses,
        eq(
          courseLibraryCourses.id,
          videoaskVocalHackPlacements.targetCourseId,
        ),
      )
      .leftJoin(
        courseLibraryModules,
        eq(
          courseLibraryModules.id,
          videoaskVocalHackPlacements.targetModuleId,
        ),
      )
      .orderBy(
        asc(videoaskVocalHackPlacements.sourceGroup),
        asc(videoaskFormImports.sourceFormTitle),
      ),
    db
      .select({
        status: videoaskVocalHackSentences.status,
        value: count(),
      })
      .from(videoaskVocalHackSentences)
      .groupBy(videoaskVocalHackSentences.status),
  ]);
  return {
    placements,
    sentences: Object.fromEntries(
      sentenceCounts.map((row) => [row.status, Number(row.value)]),
    ),
  };
}

export type UpdateVocalHackPlacementInput = {
  targetCourseId?: string | null;
  targetModuleId?: string | null;
  targetLessonId?: string | null;
  targetLessonTitle?: string | null;
  instructions?: string;
  sentences?: Array<{
    id: string;
    chinese: string;
    pinyin: string;
    english: string;
  }>;
};

async function getPlacementCatalog() {
  const courses = await db
    .select({
      id: courseLibraryCourses.id,
      title: courseLibraryCourses.title,
      status: courseLibraryCourses.status,
    })
    .from(courseLibraryCourses)
    .where(isNull(courseLibraryCourses.deletedAt))
    .orderBy(asc(courseLibraryCourses.sortOrder), asc(courseLibraryCourses.title));
  const courseIds = courses.map((course) => course.id);
  const modules =
    courseIds.length > 0
      ? await db
          .select({
            id: courseLibraryModules.id,
            courseId: courseLibraryModules.courseId,
            title: courseLibraryModules.title,
            sortOrder: courseLibraryModules.sortOrder,
          })
          .from(courseLibraryModules)
          .where(
            and(
              inArray(courseLibraryModules.courseId, courseIds),
              isNull(courseLibraryModules.deletedAt),
            ),
          )
          .orderBy(
            asc(courseLibraryModules.courseId),
            asc(courseLibraryModules.sortOrder),
          )
      : [];
  const moduleIds = modules.map((module) => module.id);
  const lessons =
    moduleIds.length > 0
      ? await db
          .select({
            id: courseLibraryLessons.id,
            moduleId: courseLibraryLessons.moduleId,
            title: courseLibraryLessons.title,
            lessonType: courseLibraryLessons.lessonType,
            sortOrder: courseLibraryLessons.sortOrder,
          })
          .from(courseLibraryLessons)
          .where(
            and(
              inArray(courseLibraryLessons.moduleId, moduleIds),
              isNull(courseLibraryLessons.deletedAt),
            ),
          )
          .orderBy(
            asc(courseLibraryLessons.moduleId),
            asc(courseLibraryLessons.sortOrder),
          )
      : [];

  return { courses, modules, lessons };
}

/** Full review payload for one proposed native Vocal Hack lesson. */
export async function getVocalHackPlacementDetail(placementId: string) {
  const [[placement], sentences, catalog] = await Promise.all([
    db
      .select({
        id: videoaskVocalHackPlacements.id,
        formImportId: videoaskVocalHackPlacements.formImportId,
        sourceTitle: videoaskFormImports.sourceFormTitle,
        sourceGroup: videoaskVocalHackPlacements.sourceGroup,
        language: videoaskVocalHackPlacements.language,
        targetCourseId: videoaskVocalHackPlacements.targetCourseId,
        targetCourseTitle: courseLibraryCourses.title,
        targetModuleId: videoaskVocalHackPlacements.targetModuleId,
        targetModuleTitle: courseLibraryModules.title,
        targetLessonId: videoaskVocalHackPlacements.targetLessonId,
        targetLessonTitle: videoaskVocalHackPlacements.targetLessonTitle,
        publishedLessonId: videoaskVocalHackPlacements.publishedLessonId,
        action: videoaskVocalHackPlacements.action,
        confidence: videoaskVocalHackPlacements.confidence,
        mappingReason: videoaskVocalHackPlacements.mappingReason,
        instructions: videoaskVocalHackPlacements.instructions,
        status: videoaskVocalHackPlacements.status,
        totalSentences: videoaskVocalHackPlacements.totalSentences,
        readySentences: videoaskVocalHackPlacements.readySentences,
        lastError: videoaskVocalHackPlacements.lastError,
        updatedAt: videoaskVocalHackPlacements.updatedAt,
      })
      .from(videoaskVocalHackPlacements)
      .innerJoin(
        videoaskFormImports,
        eq(videoaskFormImports.id, videoaskVocalHackPlacements.formImportId),
      )
      .leftJoin(
        courseLibraryCourses,
        eq(courseLibraryCourses.id, videoaskVocalHackPlacements.targetCourseId),
      )
      .leftJoin(
        courseLibraryModules,
        eq(courseLibraryModules.id, videoaskVocalHackPlacements.targetModuleId),
      )
      .where(eq(videoaskVocalHackPlacements.id, placementId))
      .limit(1),
    db
      .select({
        id: videoaskVocalHackSentences.id,
        sortOrder: videoaskVocalHackSentences.sortOrder,
        videoUrl: videoaskVocalHackSentences.videoUrl,
        sourcePromptText: videoaskVocalHackSentences.sourcePromptText,
        sourceTranscript: videoaskVocalHackSentences.sourceTranscript,
        aiTranscript: videoaskVocalHackSentences.aiTranscript,
        chinese: videoaskVocalHackSentences.chinese,
        pinyin: videoaskVocalHackSentences.pinyin,
        english: videoaskVocalHackSentences.english,
        status: videoaskVocalHackSentences.status,
        attempts: videoaskVocalHackSentences.attempts,
        lastError: videoaskVocalHackSentences.lastError,
      })
      .from(videoaskVocalHackSentences)
      .where(eq(videoaskVocalHackSentences.placementId, placementId))
      .orderBy(asc(videoaskVocalHackSentences.sortOrder)),
    getPlacementCatalog(),
  ]);

  return placement ? { placement, sentences, catalog } : null;
}

async function validatePlacementDestination(input: {
  targetCourseId: string | null;
  targetModuleId: string | null;
  targetLessonId: string | null;
}) {
  if (!input.targetCourseId && !input.targetModuleId && !input.targetLessonId) {
    return;
  }
  if (!input.targetCourseId || !input.targetModuleId) {
    throw new Error("Choose both a destination course and module");
  }
  const [targetModule] = await db
    .select({ id: courseLibraryModules.id })
    .from(courseLibraryModules)
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryCourses.id, courseLibraryModules.courseId),
    )
    .where(
      and(
        eq(courseLibraryModules.id, input.targetModuleId),
        eq(courseLibraryModules.courseId, input.targetCourseId),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);
  if (!targetModule) {
    throw new Error("The selected module does not belong to that course");
  }
  if (!input.targetLessonId) return;
  const [targetLesson] = await db
    .select({ id: courseLibraryLessons.id })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.id, input.targetLessonId),
        eq(courseLibraryLessons.moduleId, input.targetModuleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .limit(1);
  if (!targetLesson) {
    throw new Error("The selected lesson does not belong to that module");
  }
}

/** Save admin corrections in staging without changing a Course Library lesson. */
export async function updateVocalHackPlacement(
  placementId: string,
  input: UpdateVocalHackPlacementInput,
) {
  const [current] = await db
    .select()
    .from(videoaskVocalHackPlacements)
    .where(eq(videoaskVocalHackPlacements.id, placementId))
    .limit(1);
  if (!current) throw new Error("Vocal Hack placement not found");
  if (current.publishedLessonId || current.status === "published") {
    throw new Error("A published placement cannot be edited here");
  }

  const targetCourseId =
    input.targetCourseId === undefined
      ? current.targetCourseId
      : input.targetCourseId;
  const targetModuleId =
    input.targetModuleId === undefined
      ? current.targetModuleId
      : input.targetModuleId;
  const targetLessonId =
    input.targetLessonId === undefined
      ? current.targetLessonId
      : input.targetLessonId;
  await validatePlacementDestination({
    targetCourseId,
    targetModuleId,
    targetLessonId,
  });

  const destinationWasEdited =
    (input.targetCourseId !== undefined &&
      input.targetCourseId !== current.targetCourseId) ||
    (input.targetModuleId !== undefined &&
      input.targetModuleId !== current.targetModuleId) ||
    (input.targetLessonId !== undefined &&
      input.targetLessonId !== current.targetLessonId);
  if (input.sentences) {
    const existingSentences = await db
      .select({ id: videoaskVocalHackSentences.id })
      .from(videoaskVocalHackSentences)
      .where(eq(videoaskVocalHackSentences.placementId, placementId));
    const existingIds = new Set(existingSentences.map((sentence) => sentence.id));
    if (input.sentences.some((sentence) => !existingIds.has(sentence.id))) {
      throw new Error("A sentence does not belong to this placement");
    }
  }

  await db
    .update(videoaskVocalHackPlacements)
    .set({
      targetCourseId,
      targetModuleId,
      targetLessonId,
      targetLessonTitle:
        input.targetLessonTitle === undefined
          ? current.targetLessonTitle
          : input.targetLessonTitle?.trim() || null,
      instructions:
        input.instructions === undefined
          ? current.instructions
          : input.instructions.trim(),
      action: targetLessonId
        ? "replace_placeholder"
        : targetModuleId
          ? "create_lesson"
          : "manual",
      confidence: destinationWasEdited ? "review" : current.confidence,
      mappingReason: destinationWasEdited
        ? "Destination selected or confirmed by an administrator."
        : current.mappingReason,
      updatedAt: new Date(),
    })
    .where(eq(videoaskVocalHackPlacements.id, placementId));

  if (input.sentences) {
    for (const sentence of input.sentences) {
      const chinese = sentence.chinese.trim();
      const pinyin = sentence.pinyin.trim();
      const english = sentence.english.trim();
      const ready = Boolean(chinese && pinyin && english);
      await db
        .update(videoaskVocalHackSentences)
        .set({
          chinese: chinese || null,
          pinyin: pinyin || null,
          english: english || null,
          status: ready ? "ready" : "held",
          lastError: ready ? null : "Chinese, romanisation, and English are required",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoaskVocalHackSentences.id, sentence.id),
            eq(videoaskVocalHackSentences.placementId, placementId),
          ),
        );
    }
  }

  await refreshPlacementProgress(placementId);
  return getVocalHackPlacementDetail(placementId);
}

/**
 * Atomically replace the reviewed placeholder (or append a new sibling lesson)
 * and close the staging record. This is the only workflow operation that
 * mutates an existing Course Library course.
 */
export async function publishVocalHackPlacement(
  placementId: string,
  adminUserId: string,
) {
  const published = await db.transaction(async (tx) => {
    const [placement] = await tx
      .update(videoaskVocalHackPlacements)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(
        and(
          eq(videoaskVocalHackPlacements.id, placementId),
          eq(videoaskVocalHackPlacements.status, "ready_for_review"),
          isNull(videoaskVocalHackPlacements.publishedLessonId),
        ),
      )
      .returning();
    if (!placement) {
      throw new Error(
        "This placement is not ready, was already published, or is being published",
      );
    }
    if (!placement.targetCourseId || !placement.targetModuleId) {
      throw new Error("Choose a destination course and module before publishing");
    }
    if (!placement.targetLessonTitle?.trim()) {
      throw new Error("Enter a destination lesson title before publishing");
    }

    const [targetModule] = await tx
      .select({ id: courseLibraryModules.id })
      .from(courseLibraryModules)
      .innerJoin(
        courseLibraryCourses,
        eq(courseLibraryCourses.id, courseLibraryModules.courseId),
      )
      .where(
        and(
          eq(courseLibraryModules.id, placement.targetModuleId),
          eq(courseLibraryModules.courseId, placement.targetCourseId),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryCourses.deletedAt),
        ),
      )
      .limit(1);
    if (!targetModule) throw new Error("The destination module no longer exists");

    const sentences = await tx
      .select()
      .from(videoaskVocalHackSentences)
      .where(eq(videoaskVocalHackSentences.placementId, placement.id))
      .orderBy(asc(videoaskVocalHackSentences.sortOrder));
    if (
      sentences.length === 0 ||
      sentences.some(
        (sentence) =>
          sentence.status !== "ready" ||
          !sentence.chinese?.trim() ||
          !sentence.pinyin?.trim() ||
          !sentence.english?.trim(),
      )
    ) {
      throw new Error("Review and complete every sentence before publishing");
    }

    const lessonContent = {
      description: placement.instructions,
      sentences: sentences.map((sentence, index) => ({
        id: sentence.id,
        order: index,
        videoUrl: sentence.videoUrl,
        sourcePromptText: sentence.sourcePromptText,
        chinese: sentence.chinese!.trim(),
        pinyin: sentence.pinyin!.trim(),
        english: sentence.english!.trim(),
      })),
      sourceProvider: "videoask",
      sourceFormImportId: placement.formImportId,
    };
    const lessonType =
      placement.language === "cantonese" ? "vocal_hack_canto" : "vocal_hack";

    let lessonId: string;
    let destinationSnapshot: z.infer<typeof destinationSnapshotSchema>;
    if (placement.targetLessonId) {
      const [originalLesson] = await tx
        .select({
          id: courseLibraryLessons.id,
          moduleId: courseLibraryLessons.moduleId,
          title: courseLibraryLessons.title,
          lessonType: courseLibraryLessons.lessonType,
          content: courseLibraryLessons.content,
          sortOrder: courseLibraryLessons.sortOrder,
        })
        .from(courseLibraryLessons)
        .where(
          and(
            eq(courseLibraryLessons.id, placement.targetLessonId),
            eq(courseLibraryLessons.moduleId, placement.targetModuleId),
            isNull(courseLibraryLessons.deletedAt),
          ),
        )
        .limit(1);
      if (!originalLesson) {
        throw new Error("The destination lesson no longer exists");
      }
      destinationSnapshot = {
        kind: "replaced",
        publishedContent: lessonContent,
        lesson: {
          ...originalLesson,
          content: originalLesson.content as Record<string, unknown>,
        },
      };
      const [lesson] = await tx
        .update(courseLibraryLessons)
        .set({
          title: placement.targetLessonTitle.trim(),
          lessonType,
          content: lessonContent,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(courseLibraryLessons.id, placement.targetLessonId),
            eq(courseLibraryLessons.moduleId, placement.targetModuleId),
            isNull(courseLibraryLessons.deletedAt),
          ),
        )
        .returning({ id: courseLibraryLessons.id });
      if (!lesson) throw new Error("The destination lesson no longer exists");
      lessonId = lesson.id;
    } else {
      destinationSnapshot = {
        kind: "created",
        publishedContent: lessonContent,
      };
      const siblings = await tx
        .select({ sortOrder: courseLibraryLessons.sortOrder })
        .from(courseLibraryLessons)
        .where(
          and(
            eq(courseLibraryLessons.moduleId, placement.targetModuleId),
            isNull(courseLibraryLessons.deletedAt),
          ),
        );
      const nextSortOrder =
        siblings.length > 0
          ? Math.max(...siblings.map((sibling) => sibling.sortOrder)) + 1
          : 0;
      const [lesson] = await tx
        .insert(courseLibraryLessons)
        .values({
          moduleId: placement.targetModuleId,
          title: placement.targetLessonTitle.trim(),
          lessonType,
          content: lessonContent,
          sortOrder: nextSortOrder,
        })
        .returning({ id: courseLibraryLessons.id });
      lessonId = lesson.id;
    }

    const now = new Date();
    await tx
      .update(videoaskVocalHackPlacements)
      .set({
        status: "published",
        publishedLessonId: lessonId,
        approvedBy: adminUserId,
        approvedAt: now,
        publishedAt: now,
        destinationSnapshot,
        rolledBackBy: null,
        rolledBackAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(videoaskVocalHackPlacements.id, placement.id));
    return { lessonId, targetCourseId: placement.targetCourseId };
  });

  return {
    ...published,
    lessonUrl: `/admin/course-library/${published.targetCourseId}/lessons/${published.lessonId}`,
  };
}

/** Restore the original placeholder, or soft-delete a newly created lesson. */
export async function rollbackVocalHackPlacement(
  placementId: string,
  adminUserId: string,
) {
  return db.transaction(async (tx) => {
    const [placement] = await tx
      .update(videoaskVocalHackPlacements)
      .set({ status: "rolling_back", updatedAt: new Date() })
      .where(
        and(
          eq(videoaskVocalHackPlacements.id, placementId),
          eq(videoaskVocalHackPlacements.status, "published"),
          sql`${videoaskVocalHackPlacements.publishedLessonId} is not null`,
        ),
      )
      .returning();
    if (!placement?.publishedLessonId) {
      throw new Error("This placement is not currently published");
    }
    const snapshot = destinationSnapshotSchema.safeParse(
      placement.destinationSnapshot,
    );
    if (!snapshot.success) {
      throw new Error("The original destination snapshot is unavailable");
    }

    const [currentLesson] = await tx
      .select({
        id: courseLibraryLessons.id,
        content: courseLibraryLessons.content,
      })
      .from(courseLibraryLessons)
      .where(
        and(
          eq(courseLibraryLessons.id, placement.publishedLessonId),
          isNull(courseLibraryLessons.deletedAt),
        ),
      )
      .limit(1);
    if (!currentLesson) throw new Error("The published lesson no longer exists");
    const currentContent = currentLesson.content as Record<string, unknown>;
    if (
      currentContent.sourceProvider !== "videoask" ||
      currentContent.sourceFormImportId !== placement.formImportId
    ) {
      throw new Error(
        "The lesson has changed since publication; restore it manually to avoid overwriting newer work",
      );
    }
    if (
      JSON.stringify(currentContent) !==
      JSON.stringify(snapshot.data.publishedContent)
    ) {
      throw new Error(
        "The lesson was edited after publication; restore it manually to preserve those edits",
      );
    }

    if (snapshot.data.kind === "replaced") {
      if (snapshot.data.lesson.id !== currentLesson.id) {
        throw new Error("The destination snapshot does not match this lesson");
      }
      await tx
        .update(courseLibraryLessons)
        .set({
          moduleId: snapshot.data.lesson.moduleId,
          title: snapshot.data.lesson.title,
          lessonType: snapshot.data.lesson.lessonType,
          content: snapshot.data.lesson.content,
          sortOrder: snapshot.data.lesson.sortOrder,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(courseLibraryLessons.id, currentLesson.id));
    } else {
      await tx
        .update(courseLibraryLessons)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(courseLibraryLessons.id, currentLesson.id));
    }

    const now = new Date();
    await tx
      .update(videoaskVocalHackPlacements)
      .set({
        status: "rolled_back",
        publishedLessonId: null,
        rolledBackBy: adminUserId,
        rolledBackAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(videoaskVocalHackPlacements.id, placement.id));
    return {
      restored: snapshot.data.kind === "replaced",
      withdrawn: snapshot.data.kind === "created",
    };
  });
}
