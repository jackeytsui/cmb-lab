import "server-only";

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  videoaskFormImports,
  videoaskImportModules,
  videoaskImportProjects,
  videoaskMediaImports,
  videoaskStepImports,
  videoThreadSteps,
  videoThreads,
  type User,
  type VideoAskIntegration,
} from "@/db/schema";
import {
  fetchVideoAskForm,
  getVideoAskConnection,
} from "./client";
import {
  normalizeVideoAskForm,
  videoAskFolderKey,
  type NormalizedVideoAskForm,
  type NormalizedVideoAskQuestion,
} from "./mapper";
import {
  resolvedVideoAskMediaUrl,
  videoAskBlobPath,
} from "./media-storage";
import { VIDEO_THREAD_COMPLETE_TARGET } from "@/types/video-thread-player";

const ROOT_FOLDER_KEY = "__root__";
const MAX_MEDIA_ATTEMPTS = 6;
const STALE_MEDIA_PROCESSING_MS = 10 * 60 * 1_000;
const MEDIA_TRANSFER_TIMEOUT_MS = 280 * 1_000;
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

export type VideoAskImportResult = {
  status: "imported" | "skipped";
  formImportId: string;
  formId: string;
  formTitle: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  threadId: string;
  stats: Record<string, unknown>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureImportProject(
  connection: VideoAskIntegration,
  user: User,
) {
  const [existing] = await db
    .select()
    .from(videoaskImportProjects)
    .where(eq(videoaskImportProjects.organizationId, connection.organizationId))
    .limit(1);
  if (existing) return existing;

  const [course] = await db
    .insert(courseLibraryCourses)
    .values({
      title: `VideoAsk Migration — ${connection.organizationName}`,
      summary:
        "Native interactive lessons imported automatically from VideoAsk. " +
        "This course remains a draft until an administrator reviews and publishes it.",
      status: "draft",
      isPublished: false,
      createdBy: user.id,
      sortOrder: 0,
    })
    .returning();

  const [project] = await db
    .insert(videoaskImportProjects)
    .values({
      organizationId: connection.organizationId,
      courseId: course.id,
      createdBy: user.id,
    })
    .returning();
  return project;
}

async function ensureImportModule(
  project: typeof videoaskImportProjects.$inferSelect,
  form: NormalizedVideoAskForm,
) {
  const sourceFolderKey = videoAskFolderKey(form.folderId);
  const [existing] = await db
    .select()
    .from(videoaskImportModules)
    .where(
      and(
        eq(videoaskImportModules.projectId, project.id),
        eq(videoaskImportModules.sourceFolderKey, sourceFolderKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [moduleCount] = await db
    .select({ value: count() })
    .from(videoaskImportModules)
    .where(eq(videoaskImportModules.projectId, project.id));
  const title =
    form.folderName ||
    (sourceFolderKey === ROOT_FOLDER_KEY
      ? "Unfiled VideoAsk Forms"
      : `VideoAsk Folder ${sourceFolderKey.slice(0, 8)}`);

  const [module] = await db
    .insert(courseLibraryModules)
    .values({
      courseId: project.courseId,
      title,
      sortOrder: moduleCount?.value ?? 0,
    })
    .returning();
  const [mapping] = await db
    .insert(videoaskImportModules)
    .values({
      projectId: project.id,
      sourceFolderKey,
      sourceFolderId: form.folderId,
      sourceFolderName: form.folderName,
      moduleId: module.id,
    })
    .returning();
  return mapping;
}

function mediaKey(question: NormalizedVideoAskQuestion) {
  if (question.mediaId) return `id:${question.mediaId}`;
  if (!question.mediaUrl) return null;
  return `url:${createHash("sha256").update(question.mediaUrl).digest("hex")}`;
}

async function enqueueMedia(
  connection: VideoAskIntegration,
  question: NormalizedVideoAskQuestion,
) {
  if (!question.mediaUrl) return null;
  if (
    question.mediaType &&
    question.mediaType !== "video" &&
    question.mediaType !== "audio"
  ) {
    return null;
  }
  const sourceMediaKey = mediaKey(question);
  if (!sourceMediaKey) return null;

  const [media] = await db
    .insert(videoaskMediaImports)
    .values({
      organizationId: connection.organizationId,
      sourceMediaKey,
      sourceMediaId: question.mediaId,
      sourceUrl: question.mediaUrl,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [
        videoaskMediaImports.organizationId,
        videoaskMediaImports.sourceMediaKey,
      ],
      set: {
        sourceUrl: question.mediaUrl,
        sourceMediaId: question.mediaId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return media;
}

function destinationForQuestion(
  sourceQuestionId: string | null,
  stepIds: Map<string, string>,
  warnings: string[],
) {
  if (sourceQuestionId === null) return VIDEO_THREAD_COMPLETE_TARGET;
  const destination = stepIds.get(sourceQuestionId);
  if (!destination) {
    warnings.push(`Logic target ${sourceQuestionId} is not present in the form`);
    return null;
  }
  return destination;
}

async function createNativeThread(
  connection: VideoAskIntegration,
  form: NormalizedVideoAskForm,
  formImportId: string,
  user: User,
) {
  const [thread] = await db
    .insert(videoThreads)
    .values({
      title: form.title,
      description:
        form.description || `Imported from VideoAsk form ${form.id}`,
      createdBy: user.id,
    })
    .returning();

  const stepIds = new Map<string, string>();
  const stepRows = new Map<string, typeof videoThreadSteps.$inferSelect>();
  const warnings = [...form.warnings];
  let mediaQueued = 0;

  for (const [index, question] of form.questions.entries()) {
    const media = await enqueueMedia(connection, question);
    if (media && media.status === "pending") mediaQueued += 1;
    const [step] = await db
      .insert(videoThreadSteps)
      .values({
        threadId: thread.id,
        videoUrl: resolvedVideoAskMediaUrl(question.mediaUrl, media),
        mediaType: question.mediaType,
        sourceThumbnailUrl: question.thumbnailUrl,
        promptText: question.promptText,
        transcriptText: question.transcription,
        responseType: question.responseType,
        allowedResponseTypes: question.allowedResponseTypes,
        responseOptions: { options: question.options },
        logic: [],
        logicRules: [],
        isEndScreen: false,
        sortOrder: index,
        positionX: 0,
        positionY: 150 + index * 220,
      })
      .returning();
    stepIds.set(question.id, step.id);
    stepRows.set(question.id, step);

    await db
      .insert(videoaskStepImports)
      .values({
        formImportId,
        sourceQuestionId: question.id,
        sourceMediaId: question.mediaId,
        mediaImportId: media?.id ?? null,
        stepId: step.id,
        sourceSnapshot: question.source,
      })
      .onConflictDoUpdate({
        target: [
          videoaskStepImports.formImportId,
          videoaskStepImports.sourceQuestionId,
        ],
        set: {
          sourceMediaId: question.mediaId,
          mediaImportId: media?.id ?? null,
          stepId: step.id,
          sourceSnapshot: question.source,
        },
      });
  }

  for (const question of form.questions) {
    const step = stepRows.get(question.id);
    if (!step) continue;

    const conditionalLogic: Array<{
      condition: string;
      nextStepId: string;
    }> = [];
    let fallbackStepId: string | null = null;
    let defaultCompletes = false;

    for (const edge of question.logicEdges) {
      const destination = destinationForQuestion(
        edge.targetQuestionId,
        stepIds,
        warnings,
      );
      if (!destination) continue;
      if (edge.isDefault) {
        if (destination === VIDEO_THREAD_COMPLETE_TARGET) {
          defaultCompletes = true;
        } else {
          fallbackStepId = destination;
        }
      } else if (edge.conditionValue) {
        conditionalLogic.push({
          condition: edge.conditionValue,
          nextStepId: destination,
        });
      }
    }

    if (defaultCompletes && conditionalLogic.length > 0) {
      conditionalLogic.push({
        condition: "default",
        nextStepId: VIDEO_THREAD_COMPLETE_TARGET,
      });
    }

    await db
      .update(videoThreadSteps)
      .set({
        logic: conditionalLogic,
        fallbackStepId,
        isEndScreen: defaultCompletes && conditionalLogic.length === 0,
      })
      .where(eq(videoThreadSteps.id, step.id));
  }

  return {
    thread,
    warnings: uniqueStrings(warnings),
    mediaQueued,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function sourceTimestampMatches(
  sourceUpdatedAt: Date | null,
  importedUpdatedAt: Date | null,
) {
  if (!sourceUpdatedAt || !importedUpdatedAt) return false;
  return sourceUpdatedAt.getTime() === importedUpdatedAt.getTime();
}

export async function importVideoAskForm(input: {
  formId: string;
  user: User;
  force?: boolean;
}): Promise<VideoAskImportResult> {
  const connection = await getVideoAskConnection();
  if (!connection) throw new Error("VideoAsk is not connected");

  const rawForm = await fetchVideoAskForm(input.formId);
  const form = normalizeVideoAskForm(rawForm);
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify(form.source))
    .digest("hex");
  const project = await ensureImportProject(connection, input.user);
  const moduleMapping = await ensureImportModule(project, form);

  const [existing] = await db
    .select()
    .from(videoaskFormImports)
    .where(
      and(
        eq(videoaskFormImports.projectId, project.id),
        eq(videoaskFormImports.sourceFormId, form.id),
      ),
    )
    .limit(1);

  if (
    !input.force &&
    (existing?.status === "completed" ||
      existing?.status === "completed_with_warnings") &&
    existing.threadId &&
    existing.lessonId &&
    (sourceTimestampMatches(form.updatedAt, existing.sourceUpdatedAt) ||
      existing.stats.sourceFingerprint === sourceFingerprint)
  ) {
    return {
      status: "skipped",
      formImportId: existing.id,
      formId: form.id,
      formTitle: form.title,
      courseId: project.courseId,
      moduleId: moduleMapping.moduleId,
      lessonId: existing.lessonId,
      threadId: existing.threadId,
      stats: existing.stats,
    };
  }

  const now = new Date();
  const [formImport] = await db
    .insert(videoaskFormImports)
    .values({
      projectId: project.id,
      sourceFormId: form.id,
      sourceFormTitle: form.title,
      sourceFolderKey: videoAskFolderKey(form.folderId),
      sourceUpdatedAt: form.updatedAt,
      status: "importing",
      sourceSnapshot: form.source,
      importedBy: input.user.id,
      startedAt: now,
      completedAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [
        videoaskFormImports.projectId,
        videoaskFormImports.sourceFormId,
      ],
      set: {
        sourceFormTitle: form.title,
        sourceFolderKey: videoAskFolderKey(form.folderId),
        sourceUpdatedAt: form.updatedAt,
        status: "importing",
        sourceSnapshot: form.source,
        importedBy: input.user.id,
        startedAt: now,
        completedAt: null,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();

  let newThreadId: string | null = null;
  let newLessonId: string | null = null;
  try {
    const native = await createNativeThread(
      connection,
      form,
      formImport.id,
      input.user,
    );
    newThreadId = native.thread.id;

    const [lessonCount] = await db
      .select({ value: count() })
      .from(courseLibraryLessons)
      .where(eq(courseLibraryLessons.moduleId, moduleMapping.moduleId));
    const [lesson] = await db
      .insert(courseLibraryLessons)
      .values({
        moduleId: moduleMapping.moduleId,
        title: form.title,
        lessonType: "video_thread",
        content: {
          threadId: native.thread.id,
          description: form.description
            ? `<p>${escapeHtml(form.description)}</p>`
            : undefined,
          sourceProvider: "videoask",
          sourceFormId: form.id,
          sourceShareUrl: form.shareUrl,
        },
        sortOrder: lessonCount?.value ?? 0,
      })
      .returning();
    newLessonId = lesson.id;

    const stats = {
      questions: form.questions.length,
      promptTexts: form.questions.filter((question) => question.promptText).length,
      transcriptions: form.questions.filter((question) => question.transcription)
        .length,
      sourceMedia: form.questions.filter((question) => question.mediaUrl).length,
      mediaQueued: native.mediaQueued,
      logicActions: form.questions.reduce(
        (total, question) => total + question.logicEdges.length,
        0,
      ),
      warnings: native.warnings,
      sourceFingerprint,
    };

    await db
      .update(videoaskFormImports)
      .set({
        status: native.warnings.length > 0 ? "completed_with_warnings" : "completed",
        threadId: native.thread.id,
        lessonId: lesson.id,
        stats,
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(videoaskFormImports.id, formImport.id));

    // Remove the previous destination only after the replacement is complete.
    if (existing?.lessonId && existing.lessonId !== lesson.id) {
      await db
        .delete(courseLibraryLessons)
        .where(eq(courseLibraryLessons.id, existing.lessonId));
    }
    if (existing?.threadId && existing.threadId !== native.thread.id) {
      await db.delete(videoThreads).where(eq(videoThreads.id, existing.threadId));
    }

    return {
      status: "imported",
      formImportId: formImport.id,
      formId: form.id,
      formTitle: form.title,
      courseId: project.courseId,
      moduleId: moduleMapping.moduleId,
      lessonId: lesson.id,
      threadId: native.thread.id,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await db
      .update(videoaskFormImports)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(videoaskFormImports.id, formImport.id));
    if (newLessonId) {
      await db
        .delete(courseLibraryLessons)
        .where(eq(courseLibraryLessons.id, newLessonId));
    }
    if (newThreadId) {
      await db.delete(videoThreads).where(eq(videoThreads.id, newThreadId));
    }
    throw error;
  }
}

async function refreshMediaSourceUrl(
  media: typeof videoaskMediaImports.$inferSelect,
) {
  const [mapping] = await db
    .select({ sourceFormId: videoaskFormImports.sourceFormId })
    .from(videoaskStepImports)
    .innerJoin(
      videoaskFormImports,
      eq(videoaskStepImports.formImportId, videoaskFormImports.id),
    )
    .where(eq(videoaskStepImports.mediaImportId, media.id))
    .limit(1);
  if (!mapping) {
    throw new Error("Could not locate the source VideoAsk form for this media");
  }

  const form = normalizeVideoAskForm(
    await fetchVideoAskForm(mapping.sourceFormId),
  );
  const question = form.questions.find((candidate) =>
    media.sourceMediaId
      ? candidate.mediaId === media.sourceMediaId
      : mediaKey(candidate) === media.sourceMediaKey,
  );
  if (!question?.mediaUrl) {
    throw new Error("VideoAsk no longer returned a URL for this source media");
  }

  await db
    .update(videoaskMediaImports)
    .set({ sourceUrl: question.mediaUrl, updatedAt: new Date() })
    .where(eq(videoaskMediaImports.id, media.id));
  return question.mediaUrl;
}

async function fetchMediaStream(
  media: typeof videoaskMediaImports.$inferSelect,
  signal: AbortSignal,
) {
  let response = await fetch(media.sourceUrl, {
    cache: "no-store",
    signal,
  });
  if (response.ok && response.body) return response;

  await response.body?.cancel().catch(() => undefined);
  const refreshedUrl = await refreshMediaSourceUrl(media);
  response = await fetch(refreshedUrl, { cache: "no-store", signal });
  if (!response.ok || !response.body) {
    throw new Error(
      `VideoAsk media download failed after refreshing its URL (${response.status})`,
    );
  }
  return response;
}

export async function processNextVideoAskMedia() {
  const staleBefore = new Date(Date.now() - STALE_MEDIA_PROCESSING_MS);
  const [media] = await db
    .select()
    .from(videoaskMediaImports)
    .where(
      and(
        or(
          and(
            or(
              eq(videoaskMediaImports.status, "pending"),
              eq(videoaskMediaImports.status, "failed"),
            ),
            lt(videoaskMediaImports.attempts, MAX_MEDIA_ATTEMPTS),
          ),
          and(
            eq(videoaskMediaImports.status, "processing"),
            lt(videoaskMediaImports.updatedAt, staleBefore),
            lt(videoaskMediaImports.attempts, MAX_MEDIA_ATTEMPTS),
          ),
        ),
        or(
          eq(videoaskMediaImports.storageProvider, "vercel_blob"),
          eq(videoaskMediaImports.storageProvider, "mux"),
          isNull(videoaskMediaImports.storageProvider),
        ),
      ),
    )
    .orderBy(asc(videoaskMediaImports.createdAt))
    .limit(1);

  if (!media) {
    const [failed] = await db
      .select({ value: count() })
      .from(videoaskMediaImports)
      .where(eq(videoaskMediaImports.status, "failed"));
    return { status: "empty" as const, failed: failed?.value ?? 0 };
  }

  await db
    .update(videoaskMediaImports)
    .set({
      status: "processing",
      attempts: media.attempts + 1,
      storageProvider: "vercel_blob",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(videoaskMediaImports.id, media.id));

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

    const abortSignal = AbortSignal.timeout(MEDIA_TRANSFER_TIMEOUT_MS);
    const source = await fetchMediaStream(media, abortSignal);
    const sourceBody = source.body;
    if (!sourceBody) throw new Error("VideoAsk media response had no body");
    const contentType =
      source.headers.get("content-type")?.split(";", 1)[0]?.trim() ||
      "video/mp4";
    const contentLength = source.headers.get("content-length");
    const parsedSize = contentLength ? Number(contentLength) : Number.NaN;
    const sizeBytes =
      Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : null;
    const blob = await put(
      videoAskBlobPath({
        organizationId: media.organizationId,
        sourceMediaId: media.sourceMediaId,
        sourceMediaKey: media.sourceMediaKey,
        contentType,
      }),
      sourceBody,
      {
        access: "private",
        allowOverwrite: true,
        contentType,
        multipart:
          sizeBytes === null || sizeBytes > MULTIPART_THRESHOLD_BYTES,
        token,
        abortSignal,
      },
    );

    const mappedSteps = await db
      .select({ stepId: videoaskStepImports.stepId })
      .from(videoaskStepImports)
      .where(eq(videoaskStepImports.mediaImportId, media.id));
    if (mappedSteps.length > 0) {
      await db
        .update(videoThreadSteps)
        .set({ videoUrl: blob.url, uploadId: null, updatedAt: new Date() })
        .where(
          inArray(
            videoThreadSteps.id,
            mappedSteps.map((row) => row.stepId),
          ),
        );
    }

    await db
      .update(videoaskMediaImports)
      .set({
        storageProvider: "vercel_blob",
        destinationUrl: blob.url,
        contentType,
        sizeBytes,
        videoUploadId: null,
        status: "ready",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));

    return {
      status: "ready" as const,
      action: "created" as const,
      mediaId: media.id,
      destinationUrl: blob.url,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Blob media import failed";
    await db
      .update(videoaskMediaImports)
      .set({
        status: "failed",
        lastError: message.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where(eq(videoaskMediaImports.id, media.id));
    return {
      status: "failed" as const,
      action: "checked" as const,
      mediaId: media.id,
      error: message,
    };
  }
}
